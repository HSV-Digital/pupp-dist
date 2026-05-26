import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq, and, desc } from 'drizzle-orm';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { uploadJobs, flaggedRows } from '../database/schema';
import { parseCsvBuffer } from './file-parsers/csv-parser';
import { parseXlsxBuffer } from './file-parsers/xlsx-parser';
import { detectSourceType } from './source-detector';
import type { ParsedFile, SourceType } from './upload.types';

export interface UploadFileResult {
	jobId: string;
	detectedSource: SourceType;
	totalRows: number;
}

export interface UploadJobData {
	uploadJobId: string;
	fileBuffer: string; // base64
	fileExtension: string;
	orgId: string;
	createdBy: string;
	detectedSource: SourceType;
	orgMpnId: string | null;
}

@Injectable()
export class UploadService implements OnModuleDestroy {
	private readonly logger = new Logger(UploadService.name);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;

	constructor(
		@InjectQueue('csp-partner-file-upload') private readonly uploadQueue: Queue,
	) {}

	async onModuleDestroy() {
		await this.databaseClient.sql.end();
	}

	async processUpload(
		file: { buffer: Buffer; originalname: string },
		orgId: string,
		createdBy: string,
		orgMpnId: string | null,
	): Promise<UploadFileResult> {
		const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';

		let parsed: ParsedFile;
		if (ext === 'csv') {
			parsed = parseCsvBuffer(file.buffer);
		} else if (ext === 'xlsx' || ext === 'xls') {
			parsed = await parseXlsxBuffer(file.buffer);
		} else {
			throw new Error('Unsupported file format. Use CSV or XLSX.');
		}

		if (parsed.headers.length === 0 || parsed.rows.length === 0) {
			throw new Error('File is empty or has no data rows.');
		}

		const sourceType = detectSourceType(parsed.headers);
		if (!sourceType) {
			throw new Error(
				'Unrecognized file format. Could not detect source type from column headers.',
			);
		}

		const jobId = randomUUID();
		await this.db.insert(uploadJobs).values({
			id: jobId,
			orgId,
			status: 'pending',
			detectedSource: sourceType,
			originalFilename: file.originalname,
			totalRows: parsed.rows.length,
			createdBy,
		});

		const jobData: UploadJobData = {
			uploadJobId: jobId,
			fileBuffer: file.buffer.toString('base64'),
			fileExtension: ext,
			orgId,
			createdBy,
			detectedSource: sourceType,
			orgMpnId,
		};

		await this.uploadQueue.add('process-file', jobData, {
			jobId,
			removeOnComplete: true,
			removeOnFail: false,
		});

		return {
			jobId,
			detectedSource: sourceType,
			totalRows: parsed.rows.length,
		};
	}

	async getJobProgress(jobId: string, orgId: string) {
		const results = await this.db
			.select()
			.from(uploadJobs)
			.where(and(eq(uploadJobs.id, jobId), eq(uploadJobs.orgId, orgId)))
			.limit(1);

		return results[0] ?? null;
	}

	async getQueuePosition(
		jobId: string,
	): Promise<{ position: number; total: number } | null> {
		const waiting = await this.uploadQueue.getJobs(['waiting'], 0, -1, true);
		const total = waiting.length;
		const index = waiting.findIndex((j) => j.id === jobId);
		if (index === -1) return null;
		return { position: index + 1, total };
	}

	parseRejectionSummary(raw: string | null): {
		flaggedCount: number;
		rejections: { reason: string; count: number }[];
	} {
		if (!raw) return { flaggedCount: 0, rejections: [] };
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object') {
				return {
					flaggedCount: Number(parsed.flaggedCount) || 0,
					rejections: Array.isArray(parsed.rejections)
						? parsed.rejections.filter(
								(r: unknown): r is { reason: string; count: number } =>
									!!r &&
									typeof r === 'object' &&
									typeof (r as { reason?: unknown }).reason === 'string' &&
									typeof (r as { count?: unknown }).count === 'number',
							)
						: [],
				};
			}
		} catch {
			// Legacy format: bare numeric string for the flagged count.
			const n = Number(raw);
			if (Number.isFinite(n)) return { flaggedCount: n, rejections: [] };
		}
		return { flaggedCount: 0, rejections: [] };
	}

	async getFlaggedRows(orgId: string, status = 'pending') {
		return this.db
			.select()
			.from(flaggedRows)
			.where(
				and(
					eq(flaggedRows.orgId, orgId),
					eq(flaggedRows.status, status),
				),
			)
			.orderBy(desc(flaggedRows.createdAt));
	}

	async resolveFlaggedRow(
		id: string,
		candidateId: string,
		resolvedBy: string,
	) {
		await this.db
			.update(flaggedRows)
			.set({
				status: 'resolved',
				resolvedBy,
				resolvedAt: new Date(),
			})
			.where(eq(flaggedRows.id, id));
	}

	async dismissFlaggedRow(id: string, resolvedBy: string) {
		await this.db
			.update(flaggedRows)
			.set({
				status: 'dismissed',
				resolvedBy,
				resolvedAt: new Date(),
			})
			.where(eq(flaggedRows.id, id));
	}
}
