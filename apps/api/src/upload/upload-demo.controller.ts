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
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { DemoModeGuard } from '../common/guards/demo-mode.guard';
import { getEnv } from '../config/env';
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

@Public()
@UseGuards(DemoModeGuard)
@Controller('api/reseller/demo/upload')
export class UploadDemoController {
	constructor(private readonly uploadService: UploadService) {}

	private get demoOrgId(): string {
		return getEnv().demoResellerOrgId;
	}

	private get demoUserId(): string {
		return getEnv().demoResellerUserId;
	}

	@Post('file')
	@UseInterceptors(
		FileInterceptor('file', {
			limits: { fileSize: MAX_FILE_SIZE },
			fileFilter: (_req: unknown, file: any, callback: any) => {
				const ext = file.originalname?.split('.').pop()?.toLowerCase();
				if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
					callback(
						new BadRequestException('Only CSV and XLSX files are supported'),
						false,
					);
					return;
				}
				callback(null, true);
			},
		}),
	)
	async uploadFile(@UploadedFile() file: unknown) {
		if (!isUploadedFile(file)) {
			throw new BadRequestException('Missing file in request');
		}

		try {
			const result = await this.uploadService.processUpload(
				file,
				this.demoOrgId,
				this.demoUserId,
				null,
			);
			return result;
		} catch (error) {
			throw new BadRequestException(
				error instanceof Error ? error.message : 'File upload failed',
			);
		}
	}

	@Get(':jobId/progress')
	async getProgress(@Param('jobId') jobId: string, @Res() res: Response) {
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.flushHeaders();

		const sendEvent = (data: unknown) => {
			res.write(`data: ${JSON.stringify(data)}\n\n`);
		};

		const poll = async () => {
			const job = await this.uploadService.getJobProgress(
				jobId,
				this.demoOrgId,
			);

			if (!job) {
				sendEvent({ status: 'not_found' });
				res.end();
				return;
			}

			const summary = this.uploadService.parseRejectionSummary(
				job.flaggedRowsData,
			);
			sendEvent({
				status: job.status,
				processed: job.processedRows,
				total: job.totalRows,
				accepted: job.acceptedRows,
				rejected: job.rejectedRows,
				flagged: summary.flaggedCount,
				rejections: summary.rejections,
				detectedSource: job.detectedSource,
			});

			if (job.status === 'completed' || job.status === 'failed') {
				res.end();
				return;
			}

			setTimeout(poll, 500);
		};

		await poll();

		res.on('close', () => {
			res.end();
		});
	}

	@Get('flagged')
	async getFlaggedRows(@Query('status') status?: string) {
		return this.uploadService.getFlaggedRows(
			this.demoOrgId,
			status || 'pending',
		);
	}

	@Post('flagged/:id/resolve')
	async resolveFlaggedRow(
		@Param('id') id: string,
		@Body() body: { candidateId: string },
	) {
		await this.uploadService.resolveFlaggedRow(
			id,
			body.candidateId,
			this.demoUserId,
		);
		return { success: true };
	}

	@Post('flagged/:id/dismiss')
	async dismissFlaggedRow(@Param('id') id: string) {
		await this.uploadService.dismissFlaggedRow(id, this.demoUserId);
		return { success: true };
	}
}
