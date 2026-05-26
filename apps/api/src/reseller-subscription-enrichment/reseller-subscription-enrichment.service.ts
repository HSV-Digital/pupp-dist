import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { resellerSubscriptionEnrichmentJobs } from '../database/schema';
import { parseCsvBuffer } from '../upload/file-parsers/csv-parser';
import { parseXlsxBuffer } from '../upload/file-parsers/xlsx-parser';
import { resolveHeaderMap } from './reseller-subscription-enrichment.mapper';
import type {
	ResellerSubscriptionEnrichmentJobData,
	ResellerSubscriptionEnrichmentProgress,
	ResellerSubscriptionEnrichmentUploadResult,
} from './reseller-subscription-enrichment.types';

const SUPPORTED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls']);

@Injectable()
export class ResellerSubscriptionEnrichmentService implements OnModuleDestroy {
	private readonly logger = new Logger(
		ResellerSubscriptionEnrichmentService.name,
	);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;

	constructor(
		@InjectQueue('reseller-subscription-enrichment')
		private readonly queue: Queue,
	) {}

	async onModuleDestroy() {
		await this.databaseClient.sql.end();
	}

	async processUpload(
		file: { buffer: Buffer; originalname: string },
		orgId: string,
		resellerUserId: string,
	): Promise<ResellerSubscriptionEnrichmentUploadResult> {
		const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
		if (!SUPPORTED_EXTENSIONS.has(ext)) {
			throw new BadRequestException('Unsupported file format. Use CSV or XLSX.');
		}

		const parsed =
			ext === 'csv'
				? parseCsvBuffer(file.buffer)
				: await parseXlsxBuffer(file.buffer);

		if (parsed.headers.length === 0 || parsed.rows.length === 0) {
			throw new BadRequestException('File is empty or has no data rows.');
		}

		const { fieldToHeader } = resolveHeaderMap(parsed.headers);
		if (!fieldToHeader.customerTpid) {
			throw new BadRequestException(
				'File must contain a "Customer TPID" column to match subscriptions.',
			);
		}

		const enrichmentFieldCount = Object.keys(fieldToHeader).filter(
			(k) => k !== 'customerTpid',
		).length;
		if (enrichmentFieldCount === 0) {
			throw new BadRequestException(
				'File must contain at least one data column besides Customer TPID.',
			);
		}

		const jobId = randomUUID();
		await this.db.insert(resellerSubscriptionEnrichmentJobs).values({
			id: jobId,
			orgId,
			status: 'pending',
			originalFilename: file.originalname,
			totalRows: parsed.rows.length,
			createdByResellerUserId: resellerUserId,
		});

		const jobData: ResellerSubscriptionEnrichmentJobData = {
			jobId,
			orgId,
			resellerUserId,
			fileBuffer: file.buffer.toString('base64'),
			fileExtension: ext as 'csv' | 'xlsx' | 'xls',
		};

		await this.queue.add('process-reseller-subscription-enrichment', jobData, {
			jobId,
			removeOnComplete: true,
			removeOnFail: false,
		});

		return { jobId, totalRows: parsed.rows.length };
	}

	async getJobProgress(
		jobId: string,
		orgId: string,
	): Promise<ResellerSubscriptionEnrichmentProgress | null> {
		const rows = await this.db
			.select()
			.from(resellerSubscriptionEnrichmentJobs)
			.where(
				and(
					eq(resellerSubscriptionEnrichmentJobs.id, jobId),
					eq(resellerSubscriptionEnrichmentJobs.orgId, orgId),
				),
			)
			.limit(1);

		const job = rows[0];
		if (!job) return null;

		return {
			status: job.status as ResellerSubscriptionEnrichmentProgress['status'],
			processed: job.processedRows,
			total: job.totalRows,
			matched: job.matchedRows,
			unmatched: job.unmatchedRows,
			updated: job.updatedSubscriptions,
			errorMessage: job.errorMessage ?? null,
		};
	}
}
