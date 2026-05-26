import { randomUUID } from 'node:crypto';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import {
	externalSubscriptions,
	resellerSubscriptionEnrichmentJobs,
} from '../database/schema';
import { parseCsvBuffer } from '../upload/file-parsers/csv-parser';
import { parseXlsxBuffer } from '../upload/file-parsers/xlsx-parser';
import {
	buildEnrichmentUpdate,
	buildInsertValues,
	isAspxDashboardVisible,
	mapRow,
	resolveHeaderMap,
} from './reseller-subscription-enrichment.mapper';
import type { ResellerSubscriptionEnrichmentJobData } from './reseller-subscription-enrichment.types';

@Processor('reseller-subscription-enrichment')
@Injectable()
export class ResellerSubscriptionEnrichmentWorker
	extends WorkerHost
	implements OnModuleDestroy
{
	private readonly logger = new Logger(
		ResellerSubscriptionEnrichmentWorker.name,
	);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;

	async onModuleDestroy() {
		await this.databaseClient.sql.end();
	}

	async process(
		job: Job<ResellerSubscriptionEnrichmentJobData>,
	): Promise<void> {
		const { jobId, orgId, resellerUserId, fileBuffer, fileExtension } =
			job.data;
		this.logger.log(
			`Processing reseller subscription enrichment job ${jobId} for org ${orgId}`,
		);

		try {
			await this.db
				.update(resellerSubscriptionEnrichmentJobs)
				.set({ status: 'processing', updatedAt: new Date() })
				.where(eq(resellerSubscriptionEnrichmentJobs.id, jobId));

			const buffer = Buffer.from(fileBuffer, 'base64');
			const parsed =
				fileExtension === 'csv'
					? parseCsvBuffer(buffer)
					: await parseXlsxBuffer(buffer);

			const { fieldToHeader } = resolveHeaderMap(parsed.headers);
			const totalRows = parsed.rows.length;

			let processedRows = 0;
			let matchedRows = 0;
			let unmatchedRows = 0;
			let updatedSubscriptions = 0;

			const updateInterval = totalRows <= 50 ? 1 : totalRows <= 500 ? 10 : 25;

			for (const rawRow of parsed.rows) {
				try {
					const row = mapRow(rawRow, fieldToHeader);

					if (!row.customerTpid) {
						unmatchedRows++;
						processedRows++;
						continue;
					}

					const existingRows = await this.db
						.select()
						.from(externalSubscriptions)
						.where(
							and(
								eq(externalSubscriptions.orgId, orgId),
								eq(externalSubscriptions.customerTpid, row.customerTpid),
							),
						);

					if (existingRows.length > 0) {
						for (const existing of existingRows) {
							const enrichmentUpdate = buildEnrichmentUpdate(row, existing);
							if (Object.keys(enrichmentUpdate).length > 0) {
								enrichmentUpdate.updatedAt = new Date();
								const updated = await this.db
									.update(externalSubscriptions)
									.set(enrichmentUpdate)
									.where(eq(externalSubscriptions.id, existing.id))
									.returning({ id: externalSubscriptions.id });
								updatedSubscriptions += updated.length;
							}
						}
						matchedRows++;
					} else {
						const now = new Date();
						const insertValues = {
							id: randomUUID(),
							orgId,
							source: 'aspx-enrichment',
							customerTpid: row.customerTpid,
							// Leave the SKU null so a later sheet can enrich it; storing
							// "Other" would prevent that.
							subscriptionName: null,
							dashboardVisible: isAspxDashboardVisible(row),
							createdBy: resellerUserId,
							createdAt: now,
							updatedAt: now,
							...buildInsertValues(row),
						};
						const inserted = await this.db
							.insert(externalSubscriptions)
							.values(insertValues)
							.returning({ id: externalSubscriptions.id });
						updatedSubscriptions += inserted.length;
						unmatchedRows++;
					}
				} catch (rowError) {
					this.logger.warn(
						`Row error in reseller enrichment job ${jobId}: ${rowError instanceof Error ? rowError.message : rowError}`,
					);
					unmatchedRows++;
				}

				processedRows++;

				if (
					processedRows % updateInterval === 0 ||
					processedRows === totalRows
				) {
					await this.db
						.update(resellerSubscriptionEnrichmentJobs)
						.set({
							processedRows,
							matchedRows,
							unmatchedRows,
							updatedSubscriptions,
							updatedAt: new Date(),
						})
						.where(eq(resellerSubscriptionEnrichmentJobs.id, jobId));
				}
			}

			await this.db
				.update(resellerSubscriptionEnrichmentJobs)
				.set({
					status: 'completed',
					processedRows,
					matchedRows,
					unmatchedRows,
					updatedSubscriptions,
					completedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(resellerSubscriptionEnrichmentJobs.id, jobId));

			this.logger.log(
				`Reseller enrichment job ${jobId} completed: ${matchedRows} matched, ${unmatchedRows} unmatched, ${updatedSubscriptions} rows upserted`,
			);
		} catch (error) {
			this.logger.error(
				`Reseller enrichment job ${jobId} failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
			);
			await this.db
				.update(resellerSubscriptionEnrichmentJobs)
				.set({
					status: 'failed',
					errorMessage:
						error instanceof Error ? error.message : 'Unknown error',
					completedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(resellerSubscriptionEnrichmentJobs.id, jobId));
			throw error;
		}
	}
}
