import { randomUUID } from 'node:crypto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CspPartnerAnalyticsEmitter } from '../csp-partner-analytics/csp-partner-analytics.emitter';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import {
	uploadJobs,
	flaggedRows,
	resellerUsers,
	CSP_PARTNER_COUNTRY_VALUES,
	type CspPartnerCountry,
} from '../database/schema';
import { parseCsvBuffer } from './file-parsers/csv-parser';
import { parseXlsxBuffer } from './file-parsers/xlsx-parser';
import { getMapper } from './column-mappers';
import { processDistributor } from './processors/distributor.processor';
import { processPartner } from './processors/partner.processor';
import { processCustomer } from './processors/customer.processor';
import {
	processSubscription,
	processRenewalPartnerBatch,
} from './processors/subscription.processor';
import type { MappedRow } from './upload.types';
import { postUploadEnrich } from './processors/post-upload-enrich';
import { getEnv } from '../config/env';
import { MailService } from '../mail/mail.service';
import type { UploadJobData } from './upload.service';

@Processor('csp-partner-file-upload', { concurrency: getEnv().uploadMaxConcurrency })
@Injectable()
export class UploadWorker extends WorkerHost {
	private readonly logger = new Logger(UploadWorker.name);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;

	constructor(
		private readonly mailService: MailService,
		private readonly cspPartnerAnalyticsEmitter: CspPartnerAnalyticsEmitter,
	) {
		super();
	}

	private async notifyUploader(params: {
		uploadJobId: string;
		createdBy: string;
		outcome:
			| {
					status: 'completed';
					accepted: number;
					rejected: number;
					flagged: number;
			  }
			| { status: 'failed'; errorMessage: string };
	}): Promise<void> {
		try {
			const userRows = await this.db
				.select({
					email: resellerUsers.email,
					displayName: resellerUsers.displayName,
				})
				.from(resellerUsers)
				.where(eq(resellerUsers.id, params.createdBy))
				.limit(1);
			const user = userRows[0];
			if (!user?.email) {
				this.logger.warn(
					`No email on file for user ${params.createdBy}; skipping completion email for job ${params.uploadJobId}`,
				);
				return;
			}

			const jobRows = await this.db
				.select({ filename: uploadJobs.originalFilename })
				.from(uploadJobs)
				.where(eq(uploadJobs.id, params.uploadJobId))
				.limit(1);
			const filename = jobRows[0]?.filename ?? 'your file';

			const env = getEnv();
			const dashboardUrl = `${env.frontendUrl}/csp-partners/dashboard`;

			if (params.outcome.status === 'completed') {
				await this.mailService.sendUploadCompletedEmail({
					to: user.email,
					recipientName: user.displayName ?? undefined,
					filename,
					accepted: params.outcome.accepted,
					rejected: params.outcome.rejected,
					flagged: params.outcome.flagged,
					dashboardUrl,
				});
			} else {
				await this.mailService.sendUploadFailedEmail({
					to: user.email,
					recipientName: user.displayName ?? undefined,
					filename,
					errorMessage: params.outcome.errorMessage,
				});
			}
		} catch (mailError) {
			this.logger.error(
				`Failed to send completion email for job ${params.uploadJobId}: ${mailError}`,
			);
		}
	}

	async process(job: Job<UploadJobData>): Promise<void> {
		const { uploadJobId, fileBuffer, fileExtension, orgId, createdBy, detectedSource, orgMpnId } =
			job.data;

		this.logger.log(
			`Processing upload job ${uploadJobId} (source: ${detectedSource})`,
		);

		try {
			// Update status to processing
			await this.db
				.update(uploadJobs)
				.set({ status: 'processing', updatedAt: new Date() })
				.where(eq(uploadJobs.id, uploadJobId));

			// Parse file
			const buffer = Buffer.from(fileBuffer, 'base64');
			const parsed =
				fileExtension === 'csv'
					? parseCsvBuffer(buffer)
					: await parseXlsxBuffer(buffer);

			const mapper = getMapper(detectedSource);
			const totalRows = parsed.rows.length;

			let processedRows = 0;
			let acceptedRows = 0;
			let rejectedRows = 0;
			let flaggedCount = 0;
			const rejectionCounts = new Map<string, number>();
			const acceptedRowsByCountry = new Map<CspPartnerCountry, number>();
			const tallyAcceptedCountry = (row: MappedRow) => {
				const value = (row.countryName ?? '').trim();
				if (!value) return;
				if (!CSP_PARTNER_COUNTRY_VALUES.includes(value as CspPartnerCountry)) {
					return;
				}
				const key = value as CspPartnerCountry;
				acceptedRowsByCountry.set(
					key,
					(acceptedRowsByCountry.get(key) ?? 0) + 1,
				);
			};
			const bumpReason = (reason: string) => {
				const trimmed = reason.trim() || 'Unknown error';
				rejectionCounts.set(trimmed, (rejectionCounts.get(trimmed) ?? 0) + 1);
			};

			const updateInterval = totalRows <= 50 ? 1 : totalRows <= 200 ? 5 : 10;
			const flushProgressIfDue = async () => {
				if (
					processedRows % updateInterval === 0 ||
					processedRows === totalRows
				) {
					await this.db
						.update(uploadJobs)
						.set({
							processedRows,
							acceptedRows,
							rejectedRows,
							updatedAt: new Date(),
						})
						.where(eq(uploadJobs.id, uploadJobId));
				}
			};

			// For RENEWAL_PARTNER, accumulate rows per customer for batched
			// processing after master/customer steps have run for each row.
			const isRenewalPartner = detectedSource === 'RENEWAL_PARTNER';
			const renewalGroups = new Map<
				string,
				Array<{ mappedRow: MappedRow; rawRow: Record<string, string> }>
			>();
			const renewalGroupKey = (row: MappedRow): string => {
				const account = (row.accountName ?? '').trim().toLowerCase();
				const partner =
					(row.partnerGlobalId ?? '').trim().toLowerCase() ||
					(row.mpnId ?? '').trim().toLowerCase();
				return `${account}|${partner}`;
			};

			for (const rawRow of parsed.rows) {
				try {
					const validation = mapper.validate(rawRow);
					if (!validation.valid) {
						rejectedRows++;
						processedRows++;
						for (const err of validation.errors) bumpReason(err);
						await flushProgressIfDue();
						continue;
					}

					const mappedRow = mapper.mapRow(rawRow);

					// Stamp the org's MPN ID (Partner One ID) on every row
					// so partner matching always has a common identifier
					if (orgMpnId && !mappedRow.mpnId) {
						mappedRow.mpnId = orgMpnId;
					}

					// Process master tables
					await processDistributor(mappedRow, detectedSource, this.db);
					await processPartner(mappedRow, detectedSource, this.db);

					// Process customer
					const customerResult = await processCustomer(
						mappedRow,
						detectedSource,
						this.db,
					);

					if (customerResult.flagged) {
						await this.db.insert(flaggedRows).values({
							id: randomUUID(),
							uploadJobId,
							orgId,
							reason: 'AMBIGUOUS_CUSTOMER',
							reasonDetail: customerResult.detail ?? null,
							rawRow: JSON.stringify(rawRow),
							candidateIds: JSON.stringify(
								customerResult.candidateIds ?? [],
							),
							status: 'pending',
						});
						flaggedCount++;
						processedRows++;
						await flushProgressIfDue();
						continue;
					}

					if (isRenewalPartner) {
						// Defer subscription processing to a per-customer batch.
						const key = renewalGroupKey(mappedRow);
						let group = renewalGroups.get(key);
						if (!group) {
							group = [];
							renewalGroups.set(key, group);
						}
						group.push({ mappedRow, rawRow });
						processedRows++;
						await flushProgressIfDue();
						continue;
					}

					// Process subscription
					const subResult = await processSubscription(
						mappedRow,
						detectedSource,
						orgId,
						createdBy,
						this.db,
					);

					if (subResult.flagged) {
						await this.db.insert(flaggedRows).values({
							id: randomUUID(),
							uploadJobId,
							orgId,
							reason: 'AMBIGUOUS_SUBSCRIPTION',
							reasonDetail: subResult.detail ?? null,
							rawRow: JSON.stringify(rawRow),
							candidateIds: JSON.stringify(
								subResult.candidateIds ?? [],
							),
							status: 'pending',
						});
						flaggedCount++;
					} else {
						acceptedRows++;
						tallyAcceptedCountry(mappedRow);
					}
				} catch (rowError) {
					this.logger.warn(
						`Row processing error in job ${uploadJobId}: ${rowError}`,
					);
					rejectedRows++;
					bumpReason(
						rowError instanceof Error
							? rowError.message
							: 'Row processing error',
					);
				}

				processedRows++;

				await flushProgressIfDue();
			}

			if (isRenewalPartner && renewalGroups.size > 0) {
				for (const [, entries] of renewalGroups) {
					try {
						const outcomes = await processRenewalPartnerBatch(
							entries.map((e) => e.mappedRow),
							orgId,
							createdBy,
							this.db,
						);
						for (let i = 0; i < entries.length; i++) {
							const outcome = outcomes[i];
							const entry = entries[i];
							if (outcome.flagged) {
								await this.db.insert(flaggedRows).values({
									id: randomUUID(),
									uploadJobId,
									orgId,
									reason: 'AMBIGUOUS_SUBSCRIPTION',
									reasonDetail: outcome.detail ?? null,
									rawRow: JSON.stringify(entry.rawRow),
									candidateIds: JSON.stringify(
										outcome.candidateIds ?? [],
									),
									status: 'pending',
								});
								flaggedCount++;
							} else if (outcome.accepted) {
								acceptedRows++;
								tallyAcceptedCountry(entry.mappedRow);
							}
						}
					} catch (batchError) {
						this.logger.warn(
							`Renewal batch processing error in job ${uploadJobId}: ${batchError}`,
						);
						const reason =
							batchError instanceof Error
								? batchError.message
								: 'Renewal batch processing error';
						for (let i = 0; i < entries.length; i++) {
							rejectedRows++;
							bumpReason(reason);
						}
					}
				}

				await this.db
					.update(uploadJobs)
					.set({
						processedRows,
						acceptedRows,
						rejectedRows,
						updatedAt: new Date(),
					})
					.where(eq(uploadJobs.id, uploadJobId));
			}

			// Post-upload enrichment: backfill missing identifiers from master tables
			const { enrichedCount } = await postUploadEnrich(orgId, this.db);

			if (enrichedCount > 0) {
				this.logger.log(
					`Upload job ${uploadJobId}: enriched ${enrichedCount} rows from master tables`,
				);
			}

			// Mark completed
			const rejections = Array.from(rejectionCounts.entries())
				.map(([reason, count]) => ({ reason, count }))
				.sort((a, b) => b.count - a.count);
			const summary =
				flaggedCount > 0 || rejections.length > 0
					? JSON.stringify({ flaggedCount, rejections })
					: null;

			await this.db
				.update(uploadJobs)
				.set({
					status: 'completed',
					processedRows,
					acceptedRows,
					rejectedRows,
					flaggedRowsData: summary,
					completedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(uploadJobs.id, uploadJobId));

			this.logger.log(
				`Upload job ${uploadJobId} completed: ${acceptedRows} accepted, ${rejectedRows} rejected, ${flaggedCount} flagged`,
			);

			await this.notifyUploader({
				uploadJobId,
				createdBy,
				outcome: {
					status: 'completed',
					accepted: acceptedRows,
					rejected: rejectedRows,
					flagged: flaggedCount,
				},
			});

			for (const [country, count] of acceptedRowsByCountry) {
				if (count <= 0) continue;
				await this.cspPartnerAnalyticsEmitter.enqueueEvent({
					orgId,
					actorId: createdBy,
					eventType: 'subscription_upload',
					country,
					uploadCount: count,
					metadata: { uploadJobId, detectedSource },
				});
			}
		} catch (error) {
			this.logger.error(
				`Upload job ${uploadJobId} failed: ${error}`,
			);

			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error';

			await this.db
				.update(uploadJobs)
				.set({
					status: 'failed',
					errorMessage,
					completedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(uploadJobs.id, uploadJobId));

			await this.notifyUploader({
				uploadJobId,
				createdBy,
				outcome: { status: 'failed', errorMessage },
			});

			throw error;
		}
	}
}
