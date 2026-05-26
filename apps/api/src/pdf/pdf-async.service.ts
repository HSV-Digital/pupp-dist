import {
	ConflictException,
	GoneException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import {
	pdfGenerationJobs,
	type InsertPdfGenerationJobRow,
} from '../database/schema';
import type { CreatePdfListLinkDto } from './dto/render-reseller-list.dto';
import { DlTokenService } from './dl-token.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { getEnv } from '../config/env';
import type { PdfFiltersPayload, PdfSortPayload } from './types/dl-token.types';
import type {
	PdfAsyncJobPart,
	PdfAsyncJobStatus,
} from './types/pdf-async-job.types';
import type {
	DashboardFilterState,
	DashboardViewMode,
} from '../dashboard/dashboard.types';
import { PdfPasswordService } from './pdf-password.service';
import type { RegionalCurrencyCode } from '@repo/shared';

const DEFAULT_ASYNC_PART_SIZE = 10_000;
const MAX_ASYNC_PART_SIZE = 25_000;
const JOB_CANCELLED_MESSAGE = 'Job cancelled by user';

export interface PdfGenerationQueueJobData {
	jobId: string;
	filters: PdfFiltersPayload;
	sort: PdfSortPayload;
	viewMode: DashboardViewMode | 'reseller-customer';
	totalRows: number;
	partSize: number;
	totalParts: number;
	selectedSkuIds: string[];
	/** Reseller org ID – required when viewMode is 'reseller-customer' */
	orgId?: string;
	/** Reseller-specific filters (simple key→string[] map) */
	resellerFilters?: Record<string, string[]>;
	/** User-selected currency override applied at render time */
	currency?: RegionalCurrencyCode;
}

function normalizeFilters(
	filters: Partial<PdfFiltersPayload> | undefined,
): PdfFiltersPayload {
	return {
		pssAIWorkforce: filters?.pssAIWorkforce ?? [],
		pssAISecurity: filters?.pssAISecurity ?? [],
		psa: filters?.psa ?? [],
		distributor: filters?.distributor ?? [],
		reseller: filters?.reseller ?? [],
		customer: filters?.customer ?? [],
		pdm: filters?.pdm ?? [],
		pmm: filters?.pmm ?? [],
		region: filters?.region ?? [],
		type: filters?.type ?? [],
		skuCategory: filters?.skuCategory ?? [],
		expSeats: filters?.expSeats ?? [],
		renewalDate: filters?.renewalDate ?? [],
		search: filters?.search?.trim() ?? '',
	};
}

function normalizeSort(
	sort: Partial<PdfSortPayload> | undefined,
): PdfSortPayload {
	const sortDir = sort?.sortDir;
	return {
		sortBy:
			typeof sort?.sortBy === 'string' && sort.sortBy.trim().length > 0
				? sort.sortBy
				: 'totalARR',
		sortDir:
			sortDir === 'ascending' || sortDir === 'descending'
				? sortDir
				: 'descending',
	};
}

function toDashboardFilters(filters: PdfFiltersPayload): DashboardFilterState {
	return {
		pssAIWorkforce: filters.pssAIWorkforce,
		pssAISecurity: filters.pssAISecurity,
		psa: filters.psa,
		distributor: filters.distributor,
		reseller: filters.reseller,
		customer: filters.customer,
		pdm: filters.pdm,
		pmm: filters.pmm,
		region: filters.region ?? [],
		type: filters.type ?? [],
		skuCategory: filters.skuCategory ?? [],
		expSeats: filters.expSeats,
		renewalDate: filters.renewalDate,
		pastRenewalDate: filters.pastRenewalDate ?? [],
	};
}

@Injectable()
export class PdfAsyncService {
	private readonly db = createDatabaseClient(resolveDatabaseUrl()).db;
	private readonly env = getEnv();
	private readonly logger = new Logger(PdfAsyncService.name);

	constructor(
		@InjectQueue('pdf-generation') private readonly pdfQueue: Queue,
		private readonly dlTokenService: DlTokenService,
		private readonly dashboardService: DashboardService,
		private readonly pdfPasswordService: PdfPasswordService,
	) {}

	async createAsyncJob(
		dto: CreatePdfListLinkDto,
		ownerEntraObjectId: string,
	): Promise<{
		id: string;
		dlToken: string;
		totalRows: number;
		totalChunks: number;
		totalParts: number;
	}> {
		const normalizedFilters = normalizeFilters(dto.filters);
		const normalizedSort = normalizeSort(dto.sort);

		const totalRows = await this.estimateRowCount(
			dto.viewMode,
			normalizedFilters,
		);

		const partSize = this.resolvePartSize();
		const totalParts = Math.ceil(totalRows / partSize);
		const totalChunks = totalParts;
		const password = this.pdfPasswordService.generatePassword();
		const encryptedPassword = this.pdfPasswordService.encryptPassword(password);

		const token = this.dlTokenService.createToken({
			scope: dto.viewMode === 'reseller' ? 'reseller-list' : 'customer-list',
			tenantId: this.env.defaultTenantId,
			filters: normalizedFilters,
			sort: normalizedSort,
			selectedSkuIds: dto.selectedSkuIds ?? [],
		});

		const jobId = crypto.randomUUID();
		await this.db.insert(pdfGenerationJobs).values({
			id: jobId,
			dlToken: token,
			createdByEntraObjectId: ownerEntraObjectId,
			status: 'queued',
			filters: normalizedFilters,
			sort: normalizedSort,
			viewMode: dto.viewMode,
			selectedSkuIds: dto.selectedSkuIds ?? [],
			totalRows,
			totalChunks,
			completedChunks: 0,
			partSize,
			totalParts,
			completedParts: 0,
			parts: [],
			progress: 0,
			pdfPasswordCiphertext: encryptedPassword,
			pdfPasswordRevealedAt: null,
		});

		const queueJobData: PdfGenerationQueueJobData = {
			jobId,
			filters: normalizedFilters,
			sort: normalizedSort,
			viewMode: dto.viewMode,
			totalRows,
			partSize,
			totalParts,
			selectedSkuIds: dto.selectedSkuIds ?? [],
			currency: dto.currency,
		};
		await this.pdfQueue.add('generate-pdf', queueJobData, { jobId });

		return {
			id: jobId,
			dlToken: token,
			totalRows,
			totalChunks,
			totalParts,
		};
	}

	async createResellerCustomerAsyncJob(
		orgId: string,
		ownerId: string,
		totalRows: number,
		resellerFilters?: Record<string, string[]>,
		sort?: { sortBy: string; sortDir: 'ascending' | 'descending' },
		currency?: RegionalCurrencyCode,
	): Promise<{
		id: string;
		dlToken: string;
		totalRows: number;
		totalChunks: number;
		totalParts: number;
	}> {
		const normalizedSort: PdfSortPayload = {
			sortBy: sort?.sortBy ?? 'createdAt',
			sortDir: sort?.sortDir ?? 'descending',
		};

		const emptyFilters = normalizeFilters({});

		const partSize = this.resolvePartSize();
		const totalParts = Math.max(1, Math.ceil(totalRows / partSize));
		const totalChunks = totalParts;
		const password = this.pdfPasswordService.generatePassword();
		const encryptedPassword = this.pdfPasswordService.encryptPassword(password);

		const token = this.dlTokenService.createToken({
			scope: 'customer-list',
			tenantId: this.env.defaultTenantId,
			filters: emptyFilters,
			sort: normalizedSort,
			selectedSkuIds: [],
		});

		const jobId = crypto.randomUUID();
		await this.db.insert(pdfGenerationJobs).values({
			id: jobId,
			dlToken: token,
			createdByEntraObjectId: ownerId,
			orgId,
			status: 'queued',
			filters: emptyFilters,
			sort: normalizedSort,
			viewMode: 'reseller-customer',
			selectedSkuIds: [],
			totalRows,
			totalChunks,
			completedChunks: 0,
			partSize,
			totalParts,
			completedParts: 0,
			parts: [],
			progress: 0,
			pdfPasswordCiphertext: encryptedPassword,
			pdfPasswordRevealedAt: null,
		});

		const queueJobData: PdfGenerationQueueJobData = {
			jobId,
			filters: emptyFilters,
			sort: normalizedSort,
			viewMode: 'reseller-customer',
			totalRows,
			partSize,
			totalParts,
			selectedSkuIds: [],
			orgId,
			resellerFilters,
			currency,
		};
		await this.pdfQueue.add('generate-pdf', queueJobData, { jobId });

		return {
			id: jobId,
			dlToken: token,
			totalRows,
			totalChunks,
			totalParts,
		};
	}

	async findJobByToken(dlToken: string) {
		const [job] = await this.db
			.select()
			.from(pdfGenerationJobs)
			.where(eq(pdfGenerationJobs.dlToken, dlToken))
			.limit(1);
		return job;
	}

	async getJobById(jobId: string) {
		const [job] = await this.db
			.select()
			.from(pdfGenerationJobs)
			.where(eq(pdfGenerationJobs.id, jobId))
			.limit(1);

		if (!job) {
			throw new NotFoundException('Job not found');
		}

		return job;
	}

	async getJobPasswordForProcessing(jobId: string): Promise<string> {
		const job = await this.getJobById(jobId);
		if (!job.pdfPasswordCiphertext || job.pdfPasswordCiphertext.length === 0) {
			throw new InternalServerErrorException(
				'Password for this PDF job is unavailable',
			);
		}

		return this.pdfPasswordService.decryptPassword(job.pdfPasswordCiphertext);
	}

	async getJobByIdForOwner(
		jobId: string,
		ownerEntraObjectId: string,
		orgId?: string,
	) {
		const conditions = [
			eq(pdfGenerationJobs.id, jobId),
			eq(pdfGenerationJobs.createdByEntraObjectId, ownerEntraObjectId),
		];
		if (orgId) {
			conditions.push(eq(pdfGenerationJobs.orgId, orgId));
		}

		const [job] = await this.db
			.select()
			.from(pdfGenerationJobs)
			.where(and(...conditions))
			.limit(1);

		if (!job) {
			throw new NotFoundException('Job not found');
		}

		return job;
	}

	async revealJobPasswordForOwner(
		jobId: string,
		ownerEntraObjectId: string,
		orgId?: string,
	): Promise<string> {
		const job = await this.getJobByIdForOwner(jobId, ownerEntraObjectId, orgId);
		if (job.status !== 'completed') {
			throw new ConflictException(
				'PDF password is available only after the job is completed',
			);
		}

		if (!job.expiresAt || job.expiresAt.getTime() <= Date.now()) {
			throw new GoneException('PDF download has expired');
		}

		if (job.pdfPasswordRevealedAt || !job.pdfPasswordCiphertext) {
			throw new GoneException('Password is no longer available');
		}

		const password = this.pdfPasswordService.decryptPassword(
			job.pdfPasswordCiphertext,
		);

		const updateConditions = [
			eq(pdfGenerationJobs.id, jobId),
			eq(pdfGenerationJobs.createdByEntraObjectId, ownerEntraObjectId),
			isNull(pdfGenerationJobs.pdfPasswordRevealedAt),
		];
		if (orgId) {
			updateConditions.push(eq(pdfGenerationJobs.orgId, orgId));
		}

		const updated = await this.db
			.update(pdfGenerationJobs)
			.set({
				pdfPasswordRevealedAt: new Date(),
				pdfPasswordCiphertext: null,
			})
			.where(and(...updateConditions))
			.returning({ id: pdfGenerationJobs.id });

		if (updated.length === 0) {
			throw new GoneException('Password is no longer available');
		}

		return password;
	}

	async updateJobProgress(jobId: string, completedChunks: number) {
		const job = await this.getJobById(jobId);
		const totalParts = Math.max(
			Number.isFinite(job.totalParts) ? job.totalParts : job.totalChunks,
			0,
		);
		const boundedCompletedChunks = Math.max(
			0,
			Math.min(completedChunks, totalParts),
		);
		const progress = this.calculateProgress(boundedCompletedChunks, totalParts);

		await this.db
			.update(pdfGenerationJobs)
			.set({
				completedChunks: boundedCompletedChunks,
				completedParts: boundedCompletedChunks,
				progress,
			})
			.where(eq(pdfGenerationJobs.id, jobId));
	}

	async updateJobProgressPercent(
		jobId: string,
		progress: number,
	): Promise<void> {
		const job = await this.getJobById(jobId);
		if (job.status === 'completed' || job.status === 'failed') {
			return;
		}

		const normalizedProgress = this.normalizeProgress(
			progress,
			job.status === 'completed',
		);
		const currentProgress =
			typeof job.progress === 'number' && Number.isFinite(job.progress)
				? job.progress
				: 0;
		const nextProgress = Math.max(currentProgress, normalizedProgress);
		if (nextProgress === currentProgress) {
			return;
		}

		const updated = await this.db
			.update(pdfGenerationJobs)
			.set({ progress: nextProgress })
			.where(eq(pdfGenerationJobs.id, jobId))
			.returning({ id: pdfGenerationJobs.id });

		if (updated.length === 0) {
			throw new NotFoundException('Job not found');
		}
	}

	async updateJobParts(
		jobId: string,
		params: {
			parts: PdfAsyncJobPart[];
			partSize?: number;
			totalRows?: number;
			progress?: number;
		},
	): Promise<void> {
		const job = await this.getJobById(jobId);
		const parts = this.normalizeParts(params.parts);
		const completedParts = parts.filter(
			(part) => part.status === 'completed',
		).length;
		const totalParts = parts.length;
		const progressFromParts = this.calculateProgress(
			completedParts,
			totalParts,
		);
		const currentProgress =
			typeof job.progress === 'number' && Number.isFinite(job.progress)
				? job.progress
				: 0;
		const overrideProgress =
			typeof params.progress === 'number' && Number.isFinite(params.progress)
				? this.normalizeProgress(params.progress, job.status === 'completed')
				: currentProgress;
		const progress = Math.max(
			currentProgress,
			progressFromParts,
			overrideProgress,
		);
		const firstCompletedPartUrl =
			parts.find(
				(part) =>
					part.status === 'completed' &&
					typeof part.blobUrl === 'string' &&
					part.blobUrl.length > 0,
			)?.blobUrl ?? null;

		const updateData: Partial<InsertPdfGenerationJobRow> = {
			parts,
			totalParts,
			completedParts,
			totalChunks: totalParts,
			completedChunks: completedParts,
			progress,
		};

		if (typeof params.partSize === 'number' && params.partSize > 0) {
			updateData.partSize = Math.min(params.partSize, MAX_ASYNC_PART_SIZE);
		}

		if (
			typeof params.totalRows === 'number' &&
			Number.isFinite(params.totalRows) &&
			params.totalRows >= 0
		) {
			updateData.totalRows = params.totalRows;
		}

		if (firstCompletedPartUrl) {
			updateData.azureBlobUrl = firstCompletedPartUrl;
		}

		const updated = await this.db
			.update(pdfGenerationJobs)
			.set(updateData)
			.where(eq(pdfGenerationJobs.id, jobId))
			.returning({ id: pdfGenerationJobs.id });

		if (updated.length === 0) {
			throw new NotFoundException('Job not found');
		}
	}

	async markJobCompleted(jobId: string): Promise<boolean> {
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 7);

		const updated = await this.db
			.update(pdfGenerationJobs)
			.set({
				status: 'completed',
				completedAt: new Date(),
				progress: 100,
				expiresAt,
			})
			.where(
				and(
					eq(pdfGenerationJobs.id, jobId),
					inArray(pdfGenerationJobs.status, ['queued', 'processing']),
				),
			)
			.returning({ id: pdfGenerationJobs.id });

		if (updated.length > 0) {
			return true;
		}

		const [job] = await this.db
			.select({ status: pdfGenerationJobs.status })
			.from(pdfGenerationJobs)
			.where(eq(pdfGenerationJobs.id, jobId))
			.limit(1);
		if (!job) {
			throw new NotFoundException('Job not found');
		}

		return job.status === 'completed';
	}

	async updateJobStatus(
		jobId: string,
		status: PdfAsyncJobStatus,
		metadata?: {
			azureBlobUrl?: string;
			errorMessage?: string;
			parts?: PdfAsyncJobPart[];
		},
	): Promise<void> {
		const updateData: Partial<InsertPdfGenerationJobRow> = { status };

		if (metadata?.azureBlobUrl) {
			updateData.azureBlobUrl = metadata.azureBlobUrl;
		}

		if (metadata?.errorMessage) {
			updateData.errorMessage = metadata.errorMessage;
		}
		if (metadata?.parts) {
			const normalizedParts = this.normalizeParts(metadata.parts);
			updateData.parts = normalizedParts;
			updateData.totalParts = normalizedParts.length;
			updateData.completedParts = normalizedParts.filter(
				(part) => part.status === 'completed',
			).length;
			updateData.totalChunks = normalizedParts.length;
			updateData.completedChunks = updateData.completedParts;
		}

		if (status === 'completed') {
			updateData.completedAt = new Date();
			updateData.progress = 100;
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + 7);
			updateData.expiresAt = expiresAt;
		}

		if (status === 'processing') {
			updateData.startedAt = new Date();
		}

		const updated = await this.db
			.update(pdfGenerationJobs)
			.set(updateData)
			.where(eq(pdfGenerationJobs.id, jobId))
			.returning({ id: pdfGenerationJobs.id });

		if (updated.length === 0) {
			throw new NotFoundException('Job not found');
		}
	}

	async markJobCancelled(
		jobId: string,
		errorMessage = JOB_CANCELLED_MESSAGE,
	): Promise<boolean> {
		const updated = await this.db
			.update(pdfGenerationJobs)
			.set({
				status: 'failed',
				errorMessage,
			})
			.where(
				and(
					eq(pdfGenerationJobs.id, jobId),
					inArray(pdfGenerationJobs.status, ['queued', 'processing']),
				),
			)
			.returning({ id: pdfGenerationJobs.id });

		return updated.length > 0;
	}

	async cancelJobForOwner(
		jobId: string,
		ownerEntraObjectId: string,
		orgId?: string,
	) {
		const job = await this.getJobByIdForOwner(jobId, ownerEntraObjectId, orgId);

		if (job.status !== 'queued' && job.status !== 'processing') {
			throw new ConflictException(
				'Job cannot be cancelled because it is already completed or failed',
			);
		}

		const bullJob = await this.pdfQueue.getJob(jobId);
		if (bullJob) {
			try {
				await bullJob.remove();
			} catch {
				this.logger.debug(
					`Queue job ${jobId} is already locked by worker; using DB cancellation`,
				);
			}
		}

		const cancelled = await this.markJobCancelled(jobId);
		if (!cancelled) {
			const latestJob = await this.getJobByIdForOwner(
				jobId,
				ownerEntraObjectId,
				orgId,
			);
			if (latestJob.status !== 'queued' && latestJob.status !== 'processing') {
				throw new ConflictException(
					'Job cannot be cancelled because it is already completed or failed',
				);
			}
		}
	}

	getJobParts(parts: unknown): PdfAsyncJobPart[] {
		return this.normalizeParts(parts);
	}

	private async estimateRowCount(
		viewMode: DashboardViewMode,
		filters: PdfFiltersPayload,
	): Promise<number> {
		return this.dashboardService.getExportRowCount({
			viewMode,
			filters: toDashboardFilters(filters),
			search: filters.search,
		});
	}

	private resolvePartSize(): number {
		const configuredPartSize = this.env.pdfAsyncPartSize;
		if (!Number.isFinite(configuredPartSize) || configuredPartSize <= 0) {
			return DEFAULT_ASYNC_PART_SIZE;
		}

		return Math.min(configuredPartSize, MAX_ASYNC_PART_SIZE);
	}

	private normalizeProgress(progress: number, isCompleted: boolean): number {
		const maxAllowed = isCompleted ? 100 : 99;
		const rounded = Math.round(progress);
		return Math.min(maxAllowed, Math.max(0, rounded));
	}

	private calculateProgress(
		completedParts: number,
		totalParts: number,
	): number {
		if (totalParts <= 0) {
			return 0;
		}
		return Math.min(
			100,
			Math.max(0, Math.round((completedParts / totalParts) * 100)),
		);
	}

	private normalizeParts(parts: unknown): PdfAsyncJobPart[] {
		if (!Array.isArray(parts)) {
			return [];
		}

		const normalized: PdfAsyncJobPart[] = [];
		for (const entry of parts) {
			if (!entry || typeof entry !== 'object') {
				continue;
			}

			const raw = entry as Record<string, unknown>;
			const partNumber = Number(raw.partNumber);
			const startRow = Number(raw.startRow);
			const endRow = Number(raw.endRow);
			const rowCount = Number(raw.rowCount);
			const fileName = raw.fileName;
			const blobName = raw.blobName;
			const blobUrl = raw.blobUrl;
			const status = raw.status;
			const errorMessage = raw.errorMessage;

			if (
				!Number.isInteger(partNumber) ||
				partNumber <= 0 ||
				!Number.isInteger(startRow) ||
				startRow <= 0 ||
				!Number.isInteger(endRow) ||
				endRow < startRow ||
				!Number.isInteger(rowCount) ||
				rowCount < 0 ||
				typeof fileName !== 'string' ||
				(fileName.trim().length === 0 && rowCount > 0) ||
				(blobName !== null && typeof blobName !== 'string') ||
				(blobUrl !== null && typeof blobUrl !== 'string') ||
				(status !== 'pending' &&
					status !== 'completed' &&
					status !== 'failed') ||
				(errorMessage !== null && typeof errorMessage !== 'string')
			) {
				continue;
			}

			normalized.push({
				partNumber,
				startRow,
				endRow,
				rowCount,
				fileName,
				blobName,
				blobUrl,
				status,
				errorMessage,
			});
		}

		return normalized.sort((left, right) => left.partNumber - right.partNumber);
	}
}
