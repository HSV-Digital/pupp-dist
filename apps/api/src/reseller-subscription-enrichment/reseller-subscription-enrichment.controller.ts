import {
	BadRequestException,
	Controller,
	Get,
	Param,
	Post,
	Res,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AllowedUserTypes } from '../auth/decorators/allowed-user-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ResellerAuthUser } from '../auth/interfaces/auth-user.interface';
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

@Controller('api/reseller/subscription-enrichment')
@AllowedUserTypes('reseller')
export class ResellerSubscriptionEnrichmentController {
	constructor(
		private readonly enrichmentService: ResellerSubscriptionEnrichmentService,
	) {}

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
	async create(
		@UploadedFile() file: unknown,
		@CurrentUser() user: ResellerAuthUser,
	) {
		if (!isUploadedFile(file)) {
			throw new BadRequestException('Missing file in request');
		}

		return this.enrichmentService.processUpload(file, user.orgId, user.userId);
	}

	@Get(':jobId/progress')
	async getProgress(
		@Param('jobId') jobId: string,
		@CurrentUser() user: ResellerAuthUser,
		@Res() res: Response,
	) {
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

			try {
				const progress = await this.enrichmentService.getJobProgress(
					jobId,
					user.orgId,
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
			} catch {
				// Transient DB error — keep the stream alive and retry next tick.
			}

			setTimeout(poll, 500);
		};

		await poll();
	}
}
