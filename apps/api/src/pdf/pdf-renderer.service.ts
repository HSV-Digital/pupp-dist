import { createHash } from 'node:crypto';
import {
	Injectable,
	InternalServerErrorException,
	Logger,
	OnModuleDestroy,
} from '@nestjs/common';
import { getEnv } from '../config/env';

interface PdfPage {
	setContent(
		html: string,
		options: { waitUntil: 'domcontentloaded'; timeout: number },
	): Promise<void>;
	pdf(options: {
		format: 'A4';
		printBackground: boolean;
		margin: {
			top: string;
			bottom: string;
			left: string;
			right: string;
		};
		preferCSSPageSize: boolean;
	}): Promise<Buffer | Uint8Array>;
	close(): Promise<void>;
}

interface PdfBrowser {
	newPage(): Promise<PdfPage>;
	close(): Promise<void>;
	isConnected?: () => boolean;
}

interface PuppeteerLikeModule {
	launch(options: { headless: boolean; args: string[] }): Promise<PdfBrowser>;
}

interface CacheEntry {
	readonly buffer: Buffer;
	readonly expiresAt: number;
}

const RETRYABLE_RENDER_ERROR_PATTERNS = [
	/printing failed/i,
	/protocol error/i,
	/page\.printtopdf/i,
	/target closed/i,
	/session closed/i,
	/browser has disconnected/i,
	/page crashed/i,
	/timed out/i,
];

export class PdfRenderException extends InternalServerErrorException {
	constructor(
		readonly retryable: boolean,
		readonly details: string,
	) {
		super('Failed to generate PDF');
	}
}

export function isRetryablePdfRenderFailure(error: unknown): boolean {
	if (error instanceof PdfRenderException) {
		return error.retryable;
	}

	if (!(error instanceof Error)) {
		return false;
	}

	const combinedMessage = `${error.name}: ${error.message}${
		error.stack ? `\n${error.stack}` : ''
	}`.toLowerCase();
	return RETRYABLE_RENDER_ERROR_PATTERNS.some((pattern) =>
		pattern.test(combinedMessage),
	);
}

@Injectable()
export class PdfRendererService implements OnModuleDestroy {
	private readonly env = getEnv();
	private readonly logger = new Logger(PdfRendererService.name);
	private browser: PdfBrowser | null = null;
	private browserPromise: Promise<PdfBrowser> | null = null;
	private readonly waiters: Array<() => void> = [];
	private activeJobs = 0;
	private readonly cache = new Map<string, CacheEntry>();

	async onModuleDestroy(): Promise<void> {
		this.cache.clear();
		await this.closeBrowser();
	}

	async renderHtmlToPdf(params: {
		html: string;
		cacheSeed?: string;
		checkCancellation?: () => Promise<boolean>;
	}): Promise<Buffer> {
		const cacheKey = params.cacheSeed
			? this.buildCacheKey(params.cacheSeed)
			: null;
		if (cacheKey) {
			const cached = this.readCache(cacheKey);
			if (cached) {
				return cached;
			}
		}

		const rendered = await this.runWithConcurrencyLimit(async () => {
			const browser = await this.getBrowser();
			const page = await browser.newPage();

			try {
				// Check cancellation before setting content
				if (params.checkCancellation && (await params.checkCancellation())) {
					await page.close().catch(() => undefined);
					throw new Error('PDF generation cancelled');
				}

				await page.setContent(params.html, {
					waitUntil: 'domcontentloaded',
					timeout: this.env.pdfRenderTimeoutMs,
				});

				// Check cancellation before generating PDF
				if (params.checkCancellation && (await params.checkCancellation())) {
					await page.close().catch(() => undefined);
					throw new Error('PDF generation cancelled');
				}

				const buffer = await page.pdf({
					format: 'A4',
					printBackground: true,
					margin: {
						top: '0',
						bottom: '0',
						left: '0',
						right: '0',
					},
					preferCSSPageSize: true,
				});

				return Buffer.from(buffer);
			} catch (error) {
				// Don't log cancellation as error
				if (
					error instanceof Error &&
					error.message === 'PDF generation cancelled'
				) {
					throw error;
				}
				const details = this.describeError(error);
				const retryable = isRetryablePdfRenderFailure(error);
				this.logger.error(
					`Failed to render HTML into PDF (retryable=${retryable}, htmlSize=${params.html.length}, activeJobs=${this.activeJobs}, timeoutMs=${this.env.pdfRenderTimeoutMs}, error="${details}")`,
					error instanceof Error ? error.stack : undefined,
				);
				throw new PdfRenderException(retryable, details);
			} finally {
				await page.close().catch(() => undefined);
			}
		});

		if (cacheKey) {
			this.writeCache(cacheKey, rendered);
		}

		return rendered;
	}

	private async runWithConcurrencyLimit<T>(task: () => Promise<T>): Promise<T> {
		if (this.activeJobs >= this.env.pdfMaxConcurrency) {
			await new Promise<void>((resolve) => {
				this.waiters.push(resolve);
			});
		}

		this.activeJobs += 1;
		try {
			return await task();
		} finally {
			this.activeJobs = Math.max(0, this.activeJobs - 1);
			const next = this.waiters.shift();
			if (next) {
				next();
			}
		}
	}

	private readCache(cacheKey: string): Buffer | null {
		const entry = this.cache.get(cacheKey);
		if (!entry) {
			return null;
		}

		if (entry.expiresAt < Date.now()) {
			this.cache.delete(cacheKey);
			return null;
		}

		return Buffer.from(entry.buffer);
	}

	private writeCache(cacheKey: string, buffer: Buffer): void {
		if (this.env.pdfCacheTtlSeconds <= 0) {
			return;
		}

		const expiresAt = Date.now() + this.env.pdfCacheTtlSeconds * 1000;
		this.cache.set(cacheKey, {
			buffer: Buffer.from(buffer),
			expiresAt,
		});
	}

	private buildCacheKey(seed: string): string {
		return createHash('sha256')
			.update(`${this.env.pdfRenderCacheVersion}:${seed}`)
			.digest('hex');
	}

	private async getBrowser(): Promise<PdfBrowser> {
		if (this.browser && this.isBrowserConnected(this.browser)) {
			return this.browser;
		}

		if (!this.browserPromise) {
			this.browserPromise = this.launchBrowser();
		}

		try {
			this.browser = await this.browserPromise;
			return this.browser;
		} finally {
			this.browserPromise = null;
		}
	}

	private isBrowserConnected(browser: PdfBrowser): boolean {
		if (typeof browser.isConnected !== 'function') {
			return true;
		}
		return browser.isConnected();
	}

	private async launchBrowser(): Promise<PdfBrowser> {
		const puppeteer = this.loadPuppeteer();
		return await puppeteer.launch({
			headless: true,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-gpu',
				'--disable-dev-shm-usage',
				'--disable-extensions',
				'--font-render-hinting=none',
			],
		});
	}

	private loadPuppeteer(): PuppeteerLikeModule {
		try {
			const loaded = require('puppeteer') as
				| PuppeteerLikeModule
				| { default: PuppeteerLikeModule };
			return 'default' in loaded ? loaded.default : loaded;
		} catch {
			throw new InternalServerErrorException(
				'Puppeteer dependency is missing. Install the "puppeteer" package in apps/api.',
			);
		}
	}

	private async closeBrowser(): Promise<void> {
		if (!this.browser) {
			return;
		}

		const browser = this.browser;
		this.browser = null;
		await browser.close().catch(() => undefined);
	}

	private describeError(error: unknown): string {
		if (error instanceof Error) {
			const name = error.name?.trim() || 'Error';
			const message = error.message?.trim() || 'Unknown error';
			return `${name}: ${message}`;
		}
		return String(error);
	}
}
