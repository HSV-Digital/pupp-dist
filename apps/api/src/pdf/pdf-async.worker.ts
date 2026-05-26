import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
	PdfAsyncService,
	type PdfGenerationQueueJobData,
} from './pdf-async.service';
import {
	PdfChunkService,
	type PreparedCustomerListRow,
} from './pdf-chunk.service';
import { BlobStorageService } from '../blob-storage/blob-storage.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { PdfService } from './pdf.service';
import { getEnv } from '../config/env';
import { PdfEncryptionService } from './pdf-encryption.service';
import { DlTokenService } from './dl-token.service';
import type {
	DashboardOpportunityRow,
	DashboardResellerRow,
} from '../dashboard/dashboard.types';
import { ResellerCustomersService } from '../reseller-customers/reseller-customers.service';
import type { ResellerListRow } from './pdf-html-templates';
import type { PdfAsyncJobPart } from './types/pdf-async-job.types';
import {
	PdfRenderException,
	isRetryablePdfRenderFailure,
} from './pdf-renderer.service';

interface LocalPdfJobPart extends PdfAsyncJobPart {
	splitDepth: number;
}

@Processor('pdf-generation')
@Injectable()
export class PdfAsyncWorker extends WorkerHost {
	private readonly env = getEnv();
	private readonly logger = new Logger(PdfAsyncWorker.name);
	private static readonly DEFAULT_PART_SIZE = 10_000;
	private static readonly MAX_PART_SIZE = 25_000;
	private static readonly FETCH_PROGRESS = 12;
	private static readonly ASSETS_PROGRESS = 18;
	private static readonly PREPARED_PROGRESS = 22;
	private static readonly PARTS_END_PROGRESS = 98;

	constructor(
		private readonly pdfAsyncService: PdfAsyncService,
		private readonly pdfChunkService: PdfChunkService,
		private readonly blobStorage: BlobStorageService,
		private readonly dashboardService: DashboardService,
		private readonly pdfService: PdfService,
		private readonly pdfEncryptionService: PdfEncryptionService,
		private readonly resellerCustomersService: ResellerCustomersService,
		private readonly dlTokenService: DlTokenService,
	) {
		super();
	}

	private async checkIfCancelled(jobId: string): Promise<boolean> {
		try {
			const dbJob = await this.pdfAsyncService.getJobById(jobId);
			return dbJob.status === 'failed';
		} catch (error) {
			this.logger.error(
				`Error checking cancellation status for job ${jobId}, aborting job`,
				error,
			);
			return true;
		}
	}

	private async abortIfCancelled(
		jobId: string,
		stage: string,
	): Promise<boolean> {
		if (!(await this.checkIfCancelled(jobId))) {
			return false;
		}

		await this.pdfAsyncService.markJobCancelled(jobId);
		this.logger.log(`Job ${jobId} was cancelled ${stage}`);
		return true;
	}

	async process(job: Job): Promise<void> {
		const {
			jobId,
			filters,
			sort,
			viewMode,
			totalRows,
			partSize,
			selectedSkuIds,
			orgId,
			resellerFilters,
		} = job.data as PdfGenerationQueueJobData;
		const resolvedPartSize = this.resolvePartSize(partSize);
		const estimatedParts = Math.ceil(totalRows / resolvedPartSize);
		const isResellerCustomer = viewMode === 'reseller-customer';
		const renderViewMode = isResellerCustomer
			? 'customer'
			: viewMode === 'opportunity'
				? 'customer'
				: viewMode;
		const fetchViewMode =
			renderViewMode === 'customer' ? 'opportunity' : 'reseller';
		let pdfPassword: string | null = null;
		let jobParts: LocalPdfJobPart[] = [];
		let activePartIndex: number | null = null;

		this.logger.log(
			`Starting PDF generation job ${jobId} (${totalRows} estimated rows, ${estimatedParts} estimated parts)`,
		);

		try {
			if (await this.abortIfCancelled(jobId, 'before processing started')) {
				return;
			}

			await this.pdfAsyncService.updateJobStatus(jobId, 'processing');

			if (isResellerCustomer && orgId) {
				const dbJob = await this.pdfAsyncService.getJobById(jobId);
				if (dbJob.orgId !== orgId) {
					this.logger.error(
						`orgId mismatch for job ${jobId}: queue=${orgId}, db=${dbJob.orgId}`,
					);
					await this.pdfAsyncService.updateJobStatus(jobId, 'failed', {
						errorMessage: 'Organization ID mismatch',
					});
					return;
				}
			}

			await this.pdfAsyncService.updateJobProgressPercent(jobId, 3);
			pdfPassword =
				await this.pdfAsyncService.getJobPasswordForProcessing(jobId);
			this.logger.log(`Fetching source rows for job ${jobId}`);

			let preparedRows: PreparedCustomerListRow[] | ResellerListRow[];

			if (isResellerCustomer && orgId) {
				// Fetch from reseller customers table
				const resellerRows = await this.resellerCustomersService.getExportRows(
					orgId,
					resellerFilters,
					sort.sortBy,
					sort.sortDir,
				);

				this.logger.log(
					`Fetched ${resellerRows.length} reseller customer rows for job ${jobId}`,
				);

				// Group reseller subscriptions by customer and populate SKU seat counts
				const emptyFilters = {
					pssAIWorkforce: [],
					pssAISecurity: [],
					psa: [],
					distributor: [],
					reseller: [],
					customer: [],
					pdm: [],
					pmm: [],
					region: [],
					type: [],
					expSeats: [],
					renewalDate: [],
					search: '',
				};

				const grouped = new Map<string, PreparedCustomerListRow>();
				for (const row of resellerRows) {
					const existing = grouped.get(row.customerName) ?? {
						customerId: row.id,
						customerName: row.customerName,
						expiringArr: 0,
						seats: 0,
						basicSeats: 0,
						standardSeats: 0,
						premiumSeats: 0,
						proposalLink: '',
						opportunityCount: 0,
					};

					existing.expiringArr += row.currentArr;
					existing.seats += row.seats;
					existing.opportunityCount += 1;

					const sku = (row.currentSku ?? '').trim().toLowerCase();
					if (sku.includes('basic')) {
						existing.basicSeats += row.seats;
					} else if (sku.includes('standard')) {
						existing.standardSeats += row.seats;
					} else if (sku.includes('premium')) {
						existing.premiumSeats += row.seats;
					}

					grouped.set(row.customerName, existing);
				}

				preparedRows = [...grouped.values()].map((row) => {
					const token = this.dlTokenService.createToken({
						scope: 'reseller-opportunities',
						tenantId: this.env.defaultTenantId,
						filters: emptyFilters,
						sort,
						selectedSkuIds: [],
						customerId: row.customerName,
						orgId: orgId,
					});

					return {
						...row,
						proposalLink: `${this.env.frontendUrl}/csp-partners/api/pdf/reseller-opportunities/${encodeURIComponent(row.customerName)}?dlToken=${encodeURIComponent(token)}`,
					};
				});
			} else {
				const allRowsRaw = await this.dashboardService.getExportRows({
					viewMode: fetchViewMode,
					filters: {
						pssAIWorkforce: filters.pssAIWorkforce ?? [],
						pssAISecurity: filters.pssAISecurity ?? [],
						psa: filters.psa ?? [],
						distributor: filters.distributor ?? [],
						reseller: filters.reseller ?? [],
						customer: filters.customer ?? [],
						pdm: filters.pdm ?? [],
						pmm: filters.pmm ?? [],
						region: filters.region ?? [],
						type: filters.type ?? [],
						skuCategory: filters.skuCategory ?? [],
						expSeats: filters.expSeats ?? [],
						renewalDate: filters.renewalDate ?? [],
						pastRenewalDate: filters.pastRenewalDate ?? [],
					},
					search: filters.search ?? '',
					sortBy: sort.sortBy,
					sortDir: sort.sortDir,
				});
				const allRows = allRowsRaw as
					| DashboardResellerRow[]
					| DashboardOpportunityRow[];

				this.logger.log(
					`Fetched ${allRows.length} source rows for job ${jobId} (${fetchViewMode})`,
				);

				preparedRows =
					renderViewMode === 'customer'
						? this.pdfChunkService.buildCustomerListRows(
								allRows as DashboardOpportunityRow[],
								filters,
								sort,
								selectedSkuIds,
							)
						: this.pdfChunkService.buildResellerListRows(
								allRows as DashboardResellerRow[],
								filters,
								sort,
								selectedSkuIds,
							);
			}

			await this.pdfAsyncService.updateJobProgressPercent(
				jobId,
				PdfAsyncWorker.FETCH_PROGRESS,
			);

			if (await this.abortIfCancelled(jobId, 'after data fetch')) {
				return;
			}

			this.logger.log(`Loading PDF assets for job ${jobId}`);
			const assets = await this.pdfService.loadTemplateAssets();
			await this.pdfAsyncService.updateJobProgressPercent(
				jobId,
				PdfAsyncWorker.ASSETS_PROGRESS,
			);

			if (await this.abortIfCancelled(jobId, 'after loading assets')) {
				return;
			}

			const preparedRowCount = preparedRows.length;
			jobParts = this.createPendingParts(
				preparedRowCount,
				resolvedPartSize,
				renderViewMode,
			);
			await this.pdfAsyncService.updateJobParts(jobId, {
				parts: this.toPersistedParts(jobParts),
				partSize: resolvedPartSize,
				totalRows: preparedRowCount,
				progress: PdfAsyncWorker.PREPARED_PROGRESS,
			});

			this.logger.log(
				`Prepared ${preparedRowCount} render rows into ${jobParts.length} parts for job ${jobId}`,
			);

			if (jobParts.length === 0) {
				const completed = await this.pdfAsyncService.markJobCompleted(jobId);
				if (!completed) {
					this.logger.log(
						`Job ${jobId} was cancelled before completion could be recorded`,
					);
				}
				return;
			}

			for (let index = 0; index < jobParts.length; ) {
				if (await this.abortIfCancelled(jobId, `before part ${index + 1}`)) {
					return;
				}

				activePartIndex = index;
				const part = jobParts[index];
				const partRows = preparedRows.slice(part.startRow - 1, part.endRow);
				await this.pdfAsyncService.updateJobProgressPercent(
					jobId,
					this.calculatePartProgress(index, jobParts.length, 0),
				);

				this.logger.log(
					`Generating part ${part.partNumber}/${jobParts.length} for job ${jobId} (${part.startRow}-${part.endRow})`,
				);
				let pdfBuffer: Buffer;
				try {
					pdfBuffer = await this.pdfChunkService.generatePdfFromPreparedRows(
						partRows,
						assets,
						renderViewMode,
						async () => this.checkIfCancelled(jobId),
					);
				} catch (error) {
					const splitParts = this.splitPartIfRetryable(
						part,
						renderViewMode,
						error,
					);
					if (!splitParts) {
						throw error;
					}

					this.logger.warn(
						`Retryable render failure for job ${jobId} on part ${part.partNumber}/${jobParts.length} (${part.startRow}-${part.endRow}, ${part.rowCount} rows). Splitting into ${splitParts[0].startRow}-${splitParts[0].endRow} and ${splitParts[1].startRow}-${splitParts[1].endRow}.`,
					);
					jobParts.splice(index, 1, ...splitParts);
					jobParts = this.reindexParts(jobParts, renderViewMode);
					await this.pdfAsyncService.updateJobParts(jobId, {
						parts: this.toPersistedParts(jobParts),
						progress: this.calculatePartProgress(index, jobParts.length, 0.2),
					});
					activePartIndex = null;
					continue;
				}
				await this.pdfAsyncService.updateJobProgressPercent(
					jobId,
					this.calculatePartProgress(index, jobParts.length, 0.6),
				);

				if (
					await this.abortIfCancelled(
						jobId,
						`after generating part ${part.partNumber}`,
					)
				) {
					return;
				}

				if (!pdfPassword) {
					throw new Error('PDF password is unavailable for encryption');
				}

				const encryptedPdfBuffer = await this.pdfEncryptionService.encryptPdf({
					pdfBuffer,
					password: pdfPassword,
				});

				const blobName = `${jobId}/${part.fileName}`;
				this.logger.log(
					`Uploading part ${part.partNumber}/${jobParts.length} for job ${jobId} (${encryptedPdfBuffer.length} bytes)`,
				);
				const blobUrl = await this.blobStorage.upload(
					'pdf-exports',
					blobName,
					encryptedPdfBuffer,
					'application/pdf',
				);

				if (
					await this.abortIfCancelled(
						jobId,
						`during upload of part ${part.partNumber}`,
					)
				) {
					return;
				}

				jobParts[index] = {
					...part,
					blobName,
					blobUrl,
					status: 'completed',
					errorMessage: null,
				};
				await this.pdfAsyncService.updateJobParts(jobId, {
					parts: this.toPersistedParts(jobParts),
					progress: this.calculatePartProgress(index, jobParts.length, 1),
				});
				activePartIndex = null;
				index += 1;
			}

			if (await this.abortIfCancelled(jobId, 'before completion')) {
				return;
			}

			const completed = await this.pdfAsyncService.markJobCompleted(jobId);
			if (!completed) {
				this.logger.log(
					`Job ${jobId} was cancelled before completion could be recorded`,
				);
				return;
			}

			this.logger.log(
				`PDF generation completed for job ${jobId} (${jobParts.length} part files)`,
			);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === 'PDF generation cancelled'
			) {
				this.logger.log(`Job ${jobId} was cancelled during PDF generation`);
				await this.pdfAsyncService.markJobCancelled(jobId);
				return;
			}

			const failureMessage = this.resolveFailureMessage(error);
			this.logger.error(`PDF generation failed for job ${jobId}:`, error);
			if (activePartIndex !== null && jobParts[activePartIndex]) {
				jobParts[activePartIndex] = {
					...jobParts[activePartIndex],
					status: 'failed',
					errorMessage: failureMessage,
				};

				try {
					await this.pdfAsyncService.updateJobParts(jobId, {
						parts: this.toPersistedParts(jobParts),
					});
				} catch {
					// Best effort only; primary failure path is status update below.
				}
			}

			await this.pdfAsyncService.updateJobStatus(jobId, 'failed', {
				errorMessage: failureMessage,
				parts: this.toPersistedParts(jobParts),
			});

			throw error;
		}
	}

	private resolvePartSize(partSize: number): number {
		if (!Number.isFinite(partSize) || partSize <= 0) {
			return PdfAsyncWorker.DEFAULT_PART_SIZE;
		}
		return Math.min(Math.floor(partSize), PdfAsyncWorker.MAX_PART_SIZE);
	}

	private createPendingParts(
		totalRows: number,
		partSize: number,
		viewMode: 'reseller' | 'customer',
	): LocalPdfJobPart[] {
		if (totalRows <= 0) {
			return [];
		}

		const parts: LocalPdfJobPart[] = [];
		let partNumber = 1;
		for (let startRow = 1; startRow <= totalRows; startRow += partSize) {
			const endRow = Math.min(startRow + partSize - 1, totalRows);
			parts.push({
				partNumber,
				startRow,
				endRow,
				rowCount: endRow - startRow + 1,
				fileName: '',
				blobName: null,
				blobUrl: null,
				status: 'pending',
				errorMessage: null,
				splitDepth: 0,
			});
			partNumber += 1;
		}
		return this.reindexParts(parts, viewMode);
	}

	private toPersistedParts(parts: LocalPdfJobPart[]): PdfAsyncJobPart[] {
		return parts.map(({ splitDepth: _splitDepth, ...part }) => part);
	}

	private reindexParts(
		parts: LocalPdfJobPart[],
		viewMode: 'reseller' | 'customer',
	): LocalPdfJobPart[] {
		const sorted = [...parts].sort(
			(left, right) => left.startRow - right.startRow,
		);
		const totalParts = sorted.length;
		return sorted.map((part, index) => ({
			...part,
			partNumber: index + 1,
			fileName: this.buildPartFileName(
				viewMode,
				part.startRow,
				part.endRow,
				totalParts,
			),
		}));
	}

	private splitPartIfRetryable(
		part: LocalPdfJobPart,
		viewMode: 'reseller' | 'customer',
		error: unknown,
	): [LocalPdfJobPart, LocalPdfJobPart] | null {
		if (!isRetryablePdfRenderFailure(error)) {
			return null;
		}
		if (part.rowCount <= this.env.pdfAsyncMinPartSize) {
			return null;
		}
		if (part.splitDepth >= this.env.pdfAsyncSplitMaxDepth) {
			return null;
		}

		const midpoint = Math.floor((part.startRow + part.endRow) / 2);
		if (midpoint < part.startRow || midpoint >= part.endRow) {
			return null;
		}

		const left: LocalPdfJobPart = {
			partNumber: part.partNumber,
			startRow: part.startRow,
			endRow: midpoint,
			rowCount: midpoint - part.startRow + 1,
			fileName: this.buildPartFileName(viewMode, part.startRow, midpoint, 2),
			blobName: null,
			blobUrl: null,
			status: 'pending',
			errorMessage: null,
			splitDepth: part.splitDepth + 1,
		};

		const right: LocalPdfJobPart = {
			partNumber: part.partNumber + 1,
			startRow: midpoint + 1,
			endRow: part.endRow,
			rowCount: part.endRow - midpoint,
			fileName: this.buildPartFileName(viewMode, midpoint + 1, part.endRow, 2),
			blobName: null,
			blobUrl: null,
			status: 'pending',
			errorMessage: null,
			splitDepth: part.splitDepth + 1,
		};

		return [left, right];
	}

	private buildPartFileName(
		viewMode: 'reseller' | 'customer',
		startRow: number,
		endRow: number,
		totalParts: number,
	): string {
		const prefix = viewMode === 'reseller' ? 'reseller_list' : 'customer_list';
		if (totalParts === 1) {
			return `${prefix}.pdf`;
		}
		return `${prefix}_${startRow}_to_${endRow}.pdf`;
	}

	private calculatePartProgress(
		partIndex: number,
		totalParts: number,
		stageRatio: number,
	): number {
		const safeTotalParts = Math.max(totalParts, 1);
		const clampedStageRatio = Math.min(1, Math.max(0, stageRatio));
		const range =
			PdfAsyncWorker.PARTS_END_PROGRESS - PdfAsyncWorker.PREPARED_PROGRESS;
		const partSpan = range / safeTotalParts;
		const progress =
			PdfAsyncWorker.PREPARED_PROGRESS +
			partIndex * partSpan +
			partSpan * clampedStageRatio;
		return Math.round(progress);
	}

	private resolveFailureMessage(error: unknown): string {
		if (error instanceof PdfRenderException) {
			return `${error.message}: ${error.details}`;
		}
		if (error instanceof Error) {
			return error.message;
		}
		return 'Unknown error';
	}
}
