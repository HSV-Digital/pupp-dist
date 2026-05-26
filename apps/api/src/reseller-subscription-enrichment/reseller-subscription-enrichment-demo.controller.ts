import {
	BadRequestException,
	Controller,
	Get,
	Param,
	Post,
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
import { ResellerSubscriptionEnrichmentService } from './reseller-subscription-enrichment.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
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
@Controller('api/reseller/demo/subscription-enrichment')
export class ResellerSubscriptionEnrichmentDemoController {
	constructor(
		private readonly enrichmentService: ResellerSubscriptionEnrichmentService,
	) {}

	private get demoOrgId(): string {
		return getEnv().demoResellerOrgId;
	}

	private get demoUserId(): string {
		return getEnv().demoResellerUserId;
	}

	@Post()
	@UseInterceptors(
		FileInterceptor('file', {
			limits: { fileSize: MAX_FILE_SIZE },
			fileFilter: (_req, file, callback) => {
				const ext = (file as { originalname?: string }).originalname
					?.split('.')
					.pop()
					?.toLowerCase();
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
	async create(@UploadedFile() file: unknown) {
		if (!isUploadedFile(file)) {
			throw new BadRequestException('Missing file in request');
		}

		return this.enrichmentService.processUpload(
			file,
			this.demoOrgId,
			this.demoUserId,
		);
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

		let closed = false;
		res.on('close', () => {
			closed = true;
			res.end();
		});

		const poll = async () => {
			if (closed) return;

			const progress = await this.enrichmentService.getJobProgress(
				jobId,
				this.demoOrgId,
			);

			if (!progress) {
				sendEvent({ status: 'not_found' });
				res.end();
				return;
			}

			sendEvent(progress);

			if (progress.status === 'completed' || progress.status === 'failed') {
				res.end();
				return;
			}

			setTimeout(poll, 500);
		};

		await poll();
	}
}
