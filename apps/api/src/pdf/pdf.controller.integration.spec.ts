import { vi, type Mock } from 'vitest';
import { PassThrough } from 'node:stream';
import { GoneException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { AuditService } from '../audit/audit.service';
import { BlobStorageService } from '../blob-storage/blob-storage.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { DlTokenService } from './dl-token.service';
import { PdfAsyncService } from './pdf-async.service';
import { PdfController } from './pdf.controller';
import { PdfRendererService } from './pdf-renderer.service';

function buildResellerRows(total: number) {
	return Array.from({ length: total }).map((_, index) => ({
		resellerName: `reseller-${index + 1}`,
		totalARR: 100_000 + index,
		totalSeats: 100 + index,
		customerCount: 10,
		subscriptionCount: 20,
		renewalDate: '2026-12-01',
	}));
}

function buildOpportunityRows() {
	return [
		{
			customerId: 'customer-1',
			subscriptionId: 'sub-1',
			customerName: 'Customer One',
			resellerName: 'reseller-a',
			distributorName: 'dist-a',
			pssAIWorkforceName: 'pss-a',
			pssAISecurityName: '',
			psaName: '',
			pdmName: 'pdm-a',
			pmmName: 'pmm-a',
			currentProduct: 'Microsoft 365 Business Basic',
			skuCategory: 'Basic',
			seatCount: 50,
			annualRevenueRunRate: 15_000,
			renewalDate: '2026-11-30',
			termMonths: 12,
			autoRenew: false,
			multiYear: false,
			hasCopilot: false,
			hasPurview: false,
			hasSureStep: false,
			currentMargin: 0.12,
			customerSegment: 'SMB',
			region: 'NA',
			notes: '',
		},
		{
			customerId: 'customer-2',
			subscriptionId: 'sub-2',
			customerName: 'Customer Two',
			resellerName: 'reseller-a',
			distributorName: 'dist-a',
			pssAIWorkforceName: 'pss-a',
			pssAISecurityName: '',
			psaName: '',
			pdmName: 'pdm-a',
			pmmName: 'pmm-a',
			currentProduct: 'Microsoft 365 Business Standard',
			skuCategory: 'Standard',
			seatCount: 75,
			annualRevenueRunRate: 30_000,
			renewalDate: '2026-11-15',
			termMonths: 12,
			autoRenew: false,
			multiYear: false,
			hasCopilot: false,
			hasPurview: false,
			hasSureStep: false,
			currentMargin: 0.12,
			customerSegment: 'SMB',
			region: 'NA',
			notes: '',
		},
	];
}

function createResponseMock() {
	const stream = new PassThrough();
	const setHeader = vi.fn();
	const send = vi.fn((payload: Buffer | string) => {
		stream.write(payload);
		stream.end();
	});
	(stream as unknown as { setHeader: typeof setHeader }).setHeader = setHeader;
	(stream as unknown as { send: typeof send }).send = send;
	return {
		stream,
		setHeader,
		send,
		readToBuffer: async () => {
			const chunks: Buffer[] = [];

			await new Promise<void>((resolve, reject) => {
				stream
					.on('data', (chunk: Buffer | string) => {
						chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
					})
					.on('end', () => resolve())
					.on('error', (error) => reject(error));
			});

			return Buffer.concat(chunks);
		},
	};
}

describe('PdfController (integration)', () => {
	let moduleRef: TestingModule;
	let controller: PdfController;
	let dashboardServiceMock: { getExportRows: Mock };
	let pdfAsyncServiceMock: {
		findJobByToken: Mock;
		getJobParts: Mock;
		revealJobPasswordForOwner: Mock;
	};
	let blobStorageMock: { download: Mock };
	let dlTokenService: DlTokenService;

	const requestPayload = {
		filters: {
			pssAIWorkforce: [],
			pssAISecurity: [],
			psa: [],
			distributor: [],
			reseller: [],
			customer: [],
			pdm: [],
			pmm: [],
			region: [],
			expSeats: [],
			expArr: [],
			renewalDate: [],
			search: '',
		},
		sort: {
			sortBy: 'totalARR',
			sortDir: 'descending' as const,
		},
		selectedSkuIds: ['bp_cb'],
	};

	beforeEach(async () => {
		dashboardServiceMock = {
			getExportRows: vi.fn(({ viewMode }: { viewMode: string }) => {
				if (viewMode === 'reseller') {
					return Promise.resolve(buildResellerRows(501));
				}

				if (viewMode === 'opportunity') {
					return Promise.resolve(buildOpportunityRows());
				}

				throw new Error(`Unexpected view mode: ${viewMode}`);
			}),
		};
		pdfAsyncServiceMock = {
			findJobByToken: vi.fn(),
			getJobParts: vi.fn((parts: unknown) => parts),
			revealJobPasswordForOwner: vi.fn(),
		};
		blobStorageMock = {
			download: vi.fn(),
		};

		moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(AuditService)
			.useValue({
				recordEvent: vi.fn().mockResolvedValue(undefined),
			})
			.overrideProvider(DashboardService)
			.useValue(dashboardServiceMock)
			.overrideProvider(PdfAsyncService)
			.useValue(pdfAsyncServiceMock)
			.overrideProvider(BlobStorageService)
			.useValue(blobStorageMock)
			.overrideProvider(PdfRendererService)
			.useValue({
				renderHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from('pdf')),
			})
			.compile();

		controller = moduleRef.get(PdfController);
		dlTokenService = moduleRef.get(DlTokenService);
		vi.spyOn(dlTokenService, 'assertTokenAvailable').mockImplementation(
			async (token) => dlTokenService.readTokenPayload(token),
		);
		vi.spyOn(dlTokenService, 'consumeToken').mockImplementation(
			async ({ token }) => dlTokenService.readTokenPayload(token),
		);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await moduleRef?.close();
	});

	it('creates signed reseller list link with expected route', () => {
		const response = controller.createResellerListLink(requestPayload);
		expect(response.url).toContain('/api/pdf/reseller-list?dlToken=');
	});

	it('renders reseller list PDF from token using full filtered export rows', async () => {
		const token = dlTokenService.createToken({
			scope: 'reseller-list',
			tenantId: 'default-tenant',
			filters: requestPayload.filters,
			sort: requestPayload.sort,
			selectedSkuIds: requestPayload.selectedSkuIds,
		});

		const response = createResponseMock();

		await controller.renderResellerListByToken(token, response.stream as never);
		const buffer = await response.readToBuffer();

		expect(buffer.length).toBeGreaterThan(0);
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'inline; filename="reseller-list.pdf"',
		);
		expect(dashboardServiceMock.getExportRows).toHaveBeenCalledWith(
			expect.objectContaining({
				viewMode: 'reseller',
			}),
		);
	});

	it('rejects tampered reseller token', async () => {
		const token = dlTokenService.createToken({
			scope: 'reseller-list',
			tenantId: 'default-tenant',
			filters: requestPayload.filters,
			sort: requestPayload.sort,
			selectedSkuIds: requestPayload.selectedSkuIds,
		});

		await expect(
			controller.renderResellerListByToken(
				`${token}x`,
				createResponseMock().stream as never,
			),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('returns gone error for expired token', async () => {
		const now = new Date('2026-02-22T00:00:00.000Z').getTime();
		const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

		const token = dlTokenService.createToken({
			scope: 'reseller-list',
			tenantId: 'default-tenant',
			filters: requestPayload.filters,
			sort: requestPayload.sort,
			selectedSkuIds: requestPayload.selectedSkuIds,
			ttlSeconds: 1,
		});

		dateNowSpy.mockReturnValue(now + 2_000);

		await expect(
			controller.renderResellerListByToken(
				token,
				createResponseMock().stream as never,
			),
		).rejects.toBeInstanceOf(GoneException);
	});

	it('enforces reseller/customer scope bindings for drill-down endpoints', async () => {
		const customerToken = dlTokenService.createToken({
			scope: 'customer-list',
			tenantId: 'default-tenant',
			filters: requestPayload.filters,
			sort: requestPayload.sort,
			selectedSkuIds: requestPayload.selectedSkuIds,
			resellerId: 'reseller-a',
		});

		await controller.renderCustomerList(
			'reseller-a',
			customerToken,
			createResponseMock().stream as never,
		);

		await expect(
			controller.renderCustomerList(
				'reseller-b',
				customerToken,
				createResponseMock().stream as never,
			),
		).rejects.toBeInstanceOf(UnauthorizedException);

		const opportunitiesToken = dlTokenService.createToken({
			scope: 'opportunities',
			tenantId: 'default-tenant',
			filters: requestPayload.filters,
			sort: requestPayload.sort,
			selectedSkuIds: requestPayload.selectedSkuIds,
			customerId: 'customer-1',
		});

		await controller.renderOpportunities(
			'customer-1',
			opportunitiesToken,
			createResponseMock().stream as never,
		);

		await expect(
			controller.renderOpportunities(
				'customer-2',
				opportunitiesToken,
				createResponseMock().stream as never,
			),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('serves a single PDF part directly for completed async jobs', async () => {
		const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
		pdfAsyncServiceMock.findJobByToken.mockResolvedValue({
			id: 'job-single',
			status: 'completed',
			errorMessage: null,
			expiresAt,
			parts: [{ partNumber: 1 }],
		});
		pdfAsyncServiceMock.getJobParts.mockReturnValue([
			{
				partNumber: 1,
				startRow: 1,
				endRow: 50,
				rowCount: 50,
				fileName: 'customer_list.pdf',
				blobName: 'job-single/customer_list.pdf',
				blobUrl: null,
				status: 'completed',
				errorMessage: null,
			},
		]);
		blobStorageMock.download.mockResolvedValue(Buffer.from('pdf-part-1'));

		const response = createResponseMock();
		await controller.renderAsyncCustomerList(
			'valid-token',
			response.stream as never,
		);
		const buffer = await response.readToBuffer();

		expect(buffer.equals(Buffer.from('pdf-part-1'))).toBe(true);
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Type',
			'application/pdf',
		);
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'inline; filename="customer_list.pdf"',
		);
		expect(blobStorageMock.download).toHaveBeenCalledWith(
			'pdf-exports',
			'job-single/customer_list.pdf',
		);
	});

	it('returns a zip archive when completed async jobs have more than two parts', async () => {
		const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
		pdfAsyncServiceMock.findJobByToken.mockResolvedValue({
			id: 'job-zip',
			status: 'completed',
			errorMessage: null,
			expiresAt,
			parts: [{ partNumber: 1 }, { partNumber: 2 }, { partNumber: 3 }],
		});
		pdfAsyncServiceMock.getJobParts.mockReturnValue([
			{
				partNumber: 1,
				startRow: 1,
				endRow: 25_000,
				rowCount: 25_000,
				fileName: 'reseller_list_1_to_25000.pdf',
				blobName: 'job-zip/part-1.pdf',
				blobUrl: null,
				status: 'completed',
				errorMessage: null,
			},
			{
				partNumber: 2,
				startRow: 25_001,
				endRow: 50_000,
				rowCount: 25_000,
				fileName: 'reseller_list_25001_to_50000.pdf',
				blobName: 'job-zip/part-2.pdf',
				blobUrl: null,
				status: 'completed',
				errorMessage: null,
			},
			{
				partNumber: 3,
				startRow: 50_001,
				endRow: 61_043,
				rowCount: 11_043,
				fileName: 'reseller_list_50001_to_61043.pdf',
				blobName: 'job-zip/part-3.pdf',
				blobUrl: null,
				status: 'completed',
				errorMessage: null,
			},
		]);
		blobStorageMock.download
			.mockResolvedValueOnce(Buffer.from('pdf-part-1'))
			.mockResolvedValueOnce(Buffer.from('pdf-part-2'))
			.mockResolvedValueOnce(Buffer.from('pdf-part-3'));

		const response = createResponseMock();
		await controller.renderAsyncResellerList(
			'zip-token',
			response.stream as never,
		);
		const buffer = await response.readToBuffer();

		expect(buffer.subarray(0, 2).toString()).toBe('PK');
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Type',
			'application/zip',
		);
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'attachment; filename="reseller-list-job-zip.zip"',
		);
		expect(blobStorageMock.download).toHaveBeenCalledTimes(3);
		expect(blobStorageMock.download).toHaveBeenNthCalledWith(
			1,
			'pdf-exports',
			'job-zip/part-1.pdf',
		);
		expect(blobStorageMock.download).toHaveBeenNthCalledWith(
			2,
			'pdf-exports',
			'job-zip/part-2.pdf',
		);
		expect(blobStorageMock.download).toHaveBeenNthCalledWith(
			3,
			'pdf-exports',
			'job-zip/part-3.pdf',
		);
	});

	it('rejects expired async downloads', async () => {
		pdfAsyncServiceMock.findJobByToken.mockResolvedValue({
			id: 'job-expired',
			status: 'completed',
			errorMessage: null,
			expiresAt: new Date(Date.now() - 1_000),
			parts: [{ partNumber: 1 }],
		});
		pdfAsyncServiceMock.getJobParts.mockReturnValue([
			{
				partNumber: 1,
				startRow: 1,
				endRow: 10,
				rowCount: 10,
				fileName: 'customer_list.pdf',
				blobName: 'job-expired/part-1.pdf',
				blobUrl: null,
				status: 'completed',
				errorMessage: null,
			},
		]);

		await expect(
			controller.renderAsyncCustomerList(
				'expired-token',
				createResponseMock().stream as never,
			),
		).rejects.toBeInstanceOf(GoneException);
	});

	it('reveals async job password for authenticated owner', async () => {
		pdfAsyncServiceMock.revealJobPasswordForOwner.mockResolvedValue(
			'Password123ABCxyz',
		);

		const response = await controller.revealAsyncJobPassword(
			'6ba7b810-9dad-11d1-80b4-00c04fd430c8',
			{ entraObjectId: 'entra-1', email: 'user@example.com' } as never,
		);

		expect(response.password).toBe('Password123ABCxyz');
		expect(pdfAsyncServiceMock.revealJobPasswordForOwner).toHaveBeenCalledWith(
			'6ba7b810-9dad-11d1-80b4-00c04fd430c8',
			'entra-1',
		);
	});

	it('requires auth context for password reveal', async () => {
		await expect(
			controller.revealAsyncJobPassword(
				'6ba7b810-9dad-11d1-80b4-00c04fd430c8',
				undefined,
			),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});
});
