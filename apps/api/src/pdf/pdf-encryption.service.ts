import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
	Injectable,
	InternalServerErrorException,
	Logger,
	OnModuleInit,
} from '@nestjs/common';
import { getEnv } from '../config/env';

const execFileAsync = promisify(execFile);

@Injectable()
export class PdfEncryptionService implements OnModuleInit {
	private readonly logger = new Logger(PdfEncryptionService.name);
	private readonly qpdfBinary = getEnv().qpdfBinary;
	private qpdfVerified = false;
	private qpdfCheckPromise: Promise<void> | null = null;

	async onModuleInit(): Promise<void> {
		await this.assertQpdfAvailable();
	}

	async encryptPdf(params: {
		pdfBuffer: Buffer;
		password: string;
	}): Promise<Buffer> {
		await this.assertQpdfAvailable();

		const tempDir = await mkdtemp(path.join(tmpdir(), 'agent-b-pdf-'));
		const inputPath = path.join(tempDir, 'input.pdf');
		const outputPath = path.join(tempDir, 'output.pdf');

		try {
			await writeFile(inputPath, params.pdfBuffer);
			await execFileAsync(
				this.qpdfBinary,
				[
					'--encrypt',
					params.password,
					params.password,
					'256',
					'--',
					inputPath,
					outputPath,
				],
				{
					timeout: 30_000,
					maxBuffer: 8 * 1024 * 1024,
				},
			);

			return await readFile(outputPath);
		} catch (error) {
			this.logger.error(
				'Failed to password-protect generated PDF',
				error instanceof Error ? error.stack : undefined,
			);
			throw new InternalServerErrorException(
				'Failed to password-protect generated PDF',
			);
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	}

	private async assertQpdfAvailable(): Promise<void> {
		if (this.qpdfVerified) {
			return;
		}

		if (!this.qpdfCheckPromise) {
			this.qpdfCheckPromise = (async () => {
				try {
					await execFileAsync(this.qpdfBinary, ['--version'], {
						timeout: 5_000,
						maxBuffer: 512 * 1024,
					});
					this.qpdfVerified = true;
				} catch (error) {
					this.logger.error(
						`qpdf binary "${this.qpdfBinary}" is unavailable`,
						error instanceof Error ? error.stack : undefined,
					);
					throw new Error(
						`qpdf binary "${this.qpdfBinary}" is required for PDF encryption`,
					);
				}
			})();
		}

		try {
			await this.qpdfCheckPromise;
		} finally {
			if (!this.qpdfVerified) {
				this.qpdfCheckPromise = null;
			}
		}
	}
}
