import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Param,
	Post,
	Query,
	Res,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AllowedUserTypes } from '../auth/decorators/allowed-user-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ResellerAuthUser } from '../auth/interfaces/auth-user.interface';
import { UploadService } from './upload.service';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls']);

interface UploadedFileData {
	originalname: string;
	mimetype: string;
	size: number;
	buffer: Buffer;
}

function isUploadedFile(value: unknown): value is UploadedFileData {
	if (!value || typeof value !== 'object') return false;
	const f = value as Partial<UploadedFileData>;
	return (
		typeof f.originalname === 'string' &&
		typeof f.size === 'number' &&
		Buffer.isBuffer(f.buffer)
	);
}

@AllowedUserTypes('reseller')
@Controller('api/reseller/upload')
export class UploadController {
	constructor(private readonly uploadService: UploadService) {}

	@Post('file')
	@UseInterceptors(
		FileInterceptor('file', {
			limits: { fileSize: MAX_FILE_SIZE },
			fileFilter: (_req: unknown, file: any, callback: any) => {
				const ext = file.originalname
					?.split('.')
					.pop()
					?.toLowerCase();
				if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
					callback(
						new BadRequestException(
							'Only CSV and XLSX files are supported',
						),
						false,
					);
					return;
				}
				callback(null, true);
			},
		}),
	)
	async uploadFile(
		@UploadedFile() file: unknown,
		@CurrentUser() user: ResellerAuthUser,
	) {
		if (!isUploadedFile(file)) {
			throw new BadRequestException('Missing file in request');
		}

		try {
			const result = await this.uploadService.processUpload(
				file,
				user.orgId,
				user.userId,
				user.mpnId ?? null,
			);
			return result;
		} catch (error) {
			throw new BadRequestException(
				error instanceof Error
					? error.message
					: 'File upload failed',
			);
		}
	}

	@Get(':jobId/progress')
	async getProgress(
		@Param('jobId') jobId: string,
		@CurrentUser() user: ResellerAuthUser,
		@Res() res: Response,
	) {
		// SSE endpoint
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.flushHeaders();

		const sendEvent = (data: any) => {
			res.write(`data: ${JSON.stringify(data)}\n\n`);
		};

		const poll = async () => {
			try {
				const job = await this.uploadService.getJobProgress(
					jobId,
					user.orgId,
				);

				if (!job) {
					sendEvent({ status: 'not_found' });
					res.end();
					return;
				}

				const summary = this.uploadService.parseRejectionSummary(
					job.flaggedRowsData,
				);
				// Queue position is best-effort — a Redis/queue hiccup must not
				// kill the SSE stream, so swallow errors and omit the field.
				let queueInfo: { position: number; total: number } | null = null;
				if (job.status === 'pending') {
					try {
						queueInfo = await this.uploadService.getQueuePosition(jobId);
					} catch {
						queueInfo = null;
					}
				}
				sendEvent({
					status: job.status,
					processed: job.processedRows,
					total: job.totalRows,
					accepted: job.acceptedRows,
					rejected: job.rejectedRows,
					flagged: summary.flaggedCount,
					rejections: summary.rejections,
					detectedSource: job.detectedSource,
					queuePosition: queueInfo?.position,
					queueTotal: queueInfo?.total,
				});

				if (job.status === 'completed' || job.status === 'failed') {
					res.end();
					return;
				}
			} catch {
				// Transient DB or queue error — keep the stream alive and try
				// again on the next tick rather than dropping the connection.
			}

			// Continue polling
			setTimeout(poll, 500);
		};

		// Start polling
		await poll();

		// Clean up on disconnect
		res.on('close', () => {
			res.end();
		});
	}

	@Get('flagged')
	async getFlaggedRows(
		@CurrentUser() user: ResellerAuthUser,
		@Query('status') status?: string,
	) {
		return this.uploadService.getFlaggedRows(
			user.orgId,
			status || 'pending',
		);
	}

	@Post('flagged/:id/resolve')
	async resolveFlaggedRow(
		@Param('id') id: string,
		@Body() body: { candidateId: string },
		@CurrentUser() user: ResellerAuthUser,
	) {
		await this.uploadService.resolveFlaggedRow(
			id,
			body.candidateId,
			user.userId,
		);
		return { success: true };
	}

	@Post('flagged/:id/dismiss')
	async dismissFlaggedRow(
		@Param('id') id: string,
		@CurrentUser() user: ResellerAuthUser,
	) {
		await this.uploadService.dismissFlaggedRow(id, user.userId);
		return { success: true };
	}
}
