import { vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import {
	PdfRenderException,
	PdfRendererService,
	isRetryablePdfRenderFailure,
} from './pdf-renderer.service';

function createServiceWithLaunch(
	launchImpl: ReturnType<typeof vi.fn>,
): PdfRendererService {
	const service = new PdfRendererService();
	vi.spyOn(
		service as unknown as { loadPuppeteer: () => { launch: unknown } },
		'loadPuppeteer',
	).mockReturnValue({
		launch: launchImpl,
	});
	return service;
}

describe('PdfRendererService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('reuses cached PDF bytes for the same cache seed', async () => {
		const page = {
			setContent: vi.fn().mockResolvedValue(undefined),
			pdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
			close: vi.fn().mockResolvedValue(undefined),
		};
		const browser = {
			newPage: vi.fn().mockResolvedValue(page),
			close: vi.fn().mockResolvedValue(undefined),
			isConnected: vi.fn().mockReturnValue(true),
		};
		const mockLaunch = vi.fn().mockResolvedValue(browser);
		const service = createServiceWithLaunch(mockLaunch);

		const first = await service.renderHtmlToPdf({
			html: '<html><body>one</body></html>',
			cacheSeed: 'same-seed',
		});
		const second = await service.renderHtmlToPdf({
			html: '<html><body>two</body></html>',
			cacheSeed: 'same-seed',
		});

		expect(first.toString()).toBe('pdf');
		expect(second.toString()).toBe('pdf');
		expect(page.pdf).toHaveBeenCalledTimes(1);
	});

	it('closes the page and surfaces a normalized error when rendering fails', async () => {
		const page = {
			setContent: vi.fn().mockRejectedValue(new Error('timeout')),
			pdf: vi.fn(),
			close: vi.fn().mockResolvedValue(undefined),
		};
		const browser = {
			newPage: vi.fn().mockResolvedValue(page),
			close: vi.fn().mockResolvedValue(undefined),
			isConnected: vi.fn().mockReturnValue(true),
		};
		const mockLaunch = vi.fn().mockResolvedValue(browser);
		const service = createServiceWithLaunch(mockLaunch);

		await expect(
			service.renderHtmlToPdf({
				html: '<html><body>bad</body></html>',
			}),
		).rejects.toBeInstanceOf(PdfRenderException);
		expect(page.close).toHaveBeenCalledTimes(1);
	});

	it('marks printToPDF protocol failures as retryable', async () => {
		const page = {
			setContent: vi.fn().mockResolvedValue(undefined),
			pdf: vi
				.fn()
				.mockRejectedValue(
					new Error('Protocol error (Page.printToPDF): Printing failed'),
				),
			close: vi.fn().mockResolvedValue(undefined),
		};
		const browser = {
			newPage: vi.fn().mockResolvedValue(page),
			close: vi.fn().mockResolvedValue(undefined),
			isConnected: vi.fn().mockReturnValue(true),
		};
		const mockLaunch = vi.fn().mockResolvedValue(browser);
		const service = createServiceWithLaunch(mockLaunch);

		await expect(
			service.renderHtmlToPdf({
				html: '<html><body>bad</body></html>',
			}),
		).rejects.toMatchObject({
			retryable: true,
		});
	});

	it('exposes retryable helper for renderer-origin errors', () => {
		expect(
			isRetryablePdfRenderFailure(
				new PdfRenderException(
					true,
					'Protocol error (Page.printToPDF): Printing failed',
				),
			),
		).toBe(true);
		expect(
			isRetryablePdfRenderFailure(new InternalServerErrorException('boom')),
		).toBe(false);
	});

	it('shuts down the browser on module destroy', async () => {
		const page = {
			setContent: vi.fn().mockResolvedValue(undefined),
			pdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
			close: vi.fn().mockResolvedValue(undefined),
		};
		const browser = {
			newPage: vi.fn().mockResolvedValue(page),
			close: vi.fn().mockResolvedValue(undefined),
			isConnected: vi.fn().mockReturnValue(true),
		};
		const mockLaunch = vi.fn().mockResolvedValue(browser);
		const service = createServiceWithLaunch(mockLaunch);
		await service.renderHtmlToPdf({
			html: '<html><body>ok</body></html>',
		});
		await service.onModuleDestroy();

		expect(browser.close).toHaveBeenCalledTimes(1);
	});
});
