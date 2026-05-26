import { vi, type Mock } from 'vitest';
import { Readable } from 'node:stream';
import {
	NotFoundException,
	UnauthorizedException,
	UnprocessableEntityException,
} from '@nestjs/common';
import { PdfService } from './pdf.service';

vi.mock('node:fs/promises', () => ({
	readFile: vi.fn().mockResolvedValue(Buffer.from('stub-image')),
}));

describe('PdfService', () => {
	const resellerRenderRequest = {
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

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function createResellerRows(offset: number, count: number) {
		return Array.from({ length: count }).map((_, index) => ({
			resellerName: `reseller-${offset + index}`,
			totalARR: 1000 + index,
			totalSeats: 100 + index,
			customerCount: 10,
			subscriptionCount: 20,
			renewalDate: '2026-12-01',
		}));
	}

	function createOpportunityRows() {
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
				seatCount: 10,
				annualRevenueRunRate: 1000,
				renewalDate: '2026-12-01',
				termMonths: 12,
				autoRenew: false,
				multiYear: false,
				hasCopilot: false,
				hasPurview: false,
				hasSureStep: false,
				currentMargin: 0.2,
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
				seatCount: 20,
				annualRevenueRunRate: 2000,
				renewalDate: '2026-11-20',
				termMonths: 12,
				autoRenew: false,
				multiYear: false,
				hasCopilot: false,
				hasPurview: false,
				hasSureStep: false,
				currentMargin: 0.2,
				customerSegment: 'SMB',
				region: 'NA',
				notes: '',
			},
		];
	}

	function createServiceMocks() {
		const dashboardService = {
			getExportRows: vi.fn(),
		};

		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(),
		};

		const pdfRenderer = {
			renderHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
		};

		return {
			dashboardService,
			dlTokenService,
			pdfRenderer,
			proposalAssetService: {
				generateSolutionZip: vi.fn().mockResolvedValue({
					blobName: 'solution.zip',
					downloadUrl: 'https://example.com/solution.zip',
				}),
			},
			service: new PdfService(
				dashboardService as never,
				dlTokenService as never,
				pdfRenderer as never,
				{
					generateSolutionZip: vi.fn().mockResolvedValue({
						blobName: 'solution.zip',
						downloadUrl: 'https://example.com/solution.zip',
					}),
				} as never,
			),
		};
	}

	function getLastRenderedHtml(pdfRenderer: { renderHtmlToPdf: Mock }): string {
		const calls = pdfRenderer.renderHtmlToPdf.mock.calls as Array<
			[{ html: string; cacheSeed?: string }]
		>;
		return calls.at(-1)?.[0].html ?? '';
	}

	async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
		const chunks: Buffer[] = [];

		await new Promise<void>((resolve, reject) => {
			(stream as Readable)
				.on('data', (chunk: Buffer | Uint8Array | string) => {
					if (Buffer.isBuffer(chunk)) {
						chunks.push(chunk);
						return;
					}

					chunks.push(Buffer.from(chunk));
				})
				.on('end', () => resolve())
				.on('error', (error) => reject(error));
		});

		return Buffer.concat(chunks);
	}

	it('loads full filtered reseller dataset via export query path', async () => {
		const { service, dashboardService, dlTokenService } = createServiceMocks();

		dashboardService.getExportRows.mockResolvedValueOnce(
			createResellerRows(0, 1100),
		);
		dlTokenService.createToken.mockImplementation(
			({ resellerId }: { resellerId?: string }) => `token-${resellerId}`,
		);

		const stream = await service.renderResellerListPdf(resellerRenderRequest);
		const buffer = await readStream(stream);

		expect(buffer.length).toBeGreaterThan(0);
		expect(dashboardService.getExportRows).toHaveBeenCalledTimes(1);
		expect(dashboardService.getExportRows).toHaveBeenCalledWith(
			expect.objectContaining({
				viewMode: 'reseller',
				sortBy: resellerRenderRequest.sort.sortBy,
				sortDir: resellerRenderRequest.sort.sortDir,
			}),
		);
	});

	it('returns 422 when no reseller rows match filters', async () => {
		const { service, dashboardService } = createServiceMocks();
		dashboardService.getExportRows.mockResolvedValueOnce([]);

		await expect(
			service.renderResellerListPdf(resellerRenderRequest),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
	});

	it('creates signed public link for reseller view download', () => {
		const { service, dlTokenService } = createServiceMocks();
		dlTokenService.createToken.mockReturnValue('signed-token');

		const link = service.createListLink({
			...resellerRenderRequest,
			viewMode: 'reseller',
		});

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'reseller-list',
				selectedSkuIds: resellerRenderRequest.selectedSkuIds,
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(link.url).toContain('/api/pdf/reseller-list?dlToken=signed-token');
	});

	it('creates signed public link for customer view download', () => {
		const { service, dlTokenService } = createServiceMocks();
		dlTokenService.createToken.mockReturnValue('signed-token');

		const link = service.createListLink({
			...resellerRenderRequest,
			viewMode: 'customer',
		});

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'customer-list',
				selectedSkuIds: resellerRenderRequest.selectedSkuIds,
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(link.url).toContain('/api/pdf/customer-list?dlToken=signed-token');
	});

	it('creates signed public link for opportunity view download', () => {
		const { service, dlTokenService } = createServiceMocks();
		dlTokenService.createToken.mockReturnValue('signed-token');

		const link = service.createListLink({
			...resellerRenderRequest,
			viewMode: 'opportunity',
		});

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'customer-list',
				selectedSkuIds: resellerRenderRequest.selectedSkuIds,
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(link.url).toContain('/api/pdf/customer-list?dlToken=signed-token');
	});

	it('renders reseller list using verified dlToken payload', async () => {
		const { service, dashboardService, dlTokenService } = createServiceMocks();

		dashboardService.getExportRows.mockResolvedValueOnce(
			createResellerRows(0, 2),
		);
		dlTokenService.createToken.mockImplementation(
			({ resellerId }: { resellerId?: string }) =>
				resellerId ? `token-${resellerId}` : 'token',
		);
		dlTokenService.verifyTokenForScope.mockReturnValue({
			v: 1,
			scope: 'reseller-list',
			tenantId: 'default-tenant',
			filters: resellerRenderRequest.filters,
			sort: resellerRenderRequest.sort,
			selectedSkuIds: resellerRenderRequest.selectedSkuIds,
			iat: 1,
			exp: 9999999,
			jti: 'jti-1',
		});

		const stream = await service.renderResellerListPdfFromToken('dl-token-1');
		const buffer = await readStream(stream);

		expect(buffer.length).toBeGreaterThan(0);
		expect(dlTokenService.verifyTokenForScope).toHaveBeenCalledWith({
			token: 'dl-token-1',
			scope: 'reseller-list',
		});
		expect(dashboardService.getExportRows).toHaveBeenCalledWith(
			expect.objectContaining({
				viewMode: 'reseller',
			}),
		);
	});

	it('renders reseller drill-down links as direct customer-list URLs', async () => {
		const { service, dashboardService, dlTokenService, pdfRenderer } =
			createServiceMocks();

		dashboardService.getExportRows.mockResolvedValueOnce(
			createResellerRows(0, 1),
		);
		dlTokenService.createToken.mockImplementation(
			({ resellerId }: { resellerId?: string }) =>
				resellerId ? `token-${resellerId}` : 'token',
		);

		await service.renderResellerListPdf(resellerRenderRequest);

		const html = getLastRenderedHtml(pdfRenderer);
		expect(html).toContain('/api/pdf/customer-list/reseller-0?dlToken=');
		expect(html).not.toContain('/api/pdf/open?url=');
		expect(
			dlTokenService.createToken.mock.calls.every(
				([params]: [{ singleUse?: boolean }]) => params.singleUse === undefined,
			),
		).toBe(true);
	});

	it('renders customer drill-down links as direct opportunities URLs', async () => {
		const { service, dashboardService, dlTokenService, pdfRenderer } =
			createServiceMocks();

		const opportunityRows = createOpportunityRows();
		dashboardService.getExportRows.mockResolvedValueOnce(opportunityRows);
		dlTokenService.createToken.mockImplementation(
			({ customerId }: { customerId?: string }) =>
				customerId ? `token-${customerId}` : 'token',
		);
		dlTokenService.verifyTokenForScope.mockReturnValue({
			v: 1,
			scope: 'customer-list',
			tenantId: 'default-tenant',
			filters: resellerRenderRequest.filters,
			sort: resellerRenderRequest.sort,
			selectedSkuIds: resellerRenderRequest.selectedSkuIds,
			resellerId: 'reseller-a',
			iat: 1,
			exp: 9999999,
			jti: 'jti-1',
		});

		await service.renderCustomerListPdf({
			resellerId: 'reseller-a',
			dlToken: 'token-1',
		});

		const html = getLastRenderedHtml(pdfRenderer);
		expect(html).toContain('/api/pdf/opportunities/customer-1?dlToken=');
		expect(html).not.toContain('/api/pdf/open?url=');
		expect(
			dlTokenService.createToken.mock.calls.every(
				([params]: [{ singleUse?: boolean }]) => params.singleUse === undefined,
			),
		).toBe(true);
	});

	it('renders top-level customer list using verified customer-list token payload', async () => {
		const { service, dashboardService, dlTokenService } = createServiceMocks();

		dashboardService.getExportRows.mockResolvedValueOnce(
			createOpportunityRows(),
		);
		dlTokenService.verifyTokenForScope.mockReturnValue({
			v: 1,
			scope: 'customer-list',
			tenantId: 'default-tenant',
			filters: resellerRenderRequest.filters,
			sort: resellerRenderRequest.sort,
			selectedSkuIds: resellerRenderRequest.selectedSkuIds,
			iat: 1,
			exp: 9999999,
			jti: 'jti-1',
		});

		const stream = await service.renderCustomerListPdfFromToken('dl-token-2');
		const buffer = await readStream(stream);

		expect(buffer.length).toBeGreaterThan(0);
		expect(dlTokenService.verifyTokenForScope).toHaveBeenCalledWith({
			token: 'dl-token-2',
			scope: 'customer-list',
		});
		expect(dashboardService.getExportRows).toHaveBeenCalledWith(
			expect.objectContaining({
				viewMode: 'opportunity',
			}),
		);
	});

	it('filters opportunities by customerId without overriding customer name filter', async () => {
		const { service, dashboardService, dlTokenService } = createServiceMocks();

		dashboardService.getExportRows.mockResolvedValueOnce(
			createOpportunityRows(),
		);
		dlTokenService.verifyTokenForScope.mockReturnValue({
			v: 1,
			scope: 'opportunities',
			tenantId: 'default-tenant',
			filters: {
				...resellerRenderRequest.filters,
				customer: [],
			},
			sort: {
				sortBy: 'annualRevenueRunRate',
				sortDir: 'descending',
			},
			selectedSkuIds: resellerRenderRequest.selectedSkuIds,
			customerId: 'customer-2',
			iat: 1,
			exp: 9999999,
			jti: 'jti-1',
		});

		const stream = await service.renderOpportunitiesPdf({
			customerId: 'customer-2',
			dlToken: 'token-2',
		});

		const buffer = await readStream(stream);
		expect(buffer.length).toBeGreaterThan(0);
		expect(dashboardService.getExportRows).toHaveBeenCalledWith(
			expect.objectContaining({
				viewMode: 'opportunity',
				filters: expect.objectContaining({
					customer: [],
				}),
			}),
		);
	});

	it('returns 404 when opportunities for the scoped customerId do not exist', async () => {
		const { service, dashboardService, dlTokenService } = createServiceMocks();

		const opportunityRows = createOpportunityRows().filter(
			(row) => row.customerId === 'customer-1',
		);
		dashboardService.getExportRows.mockResolvedValueOnce(opportunityRows);
		dlTokenService.verifyTokenForScope.mockReturnValue({
			v: 1,
			scope: 'opportunities',
			tenantId: 'default-tenant',
			filters: resellerRenderRequest.filters,
			sort: {
				sortBy: 'annualRevenueRunRate',
				sortDir: 'descending',
			},
			selectedSkuIds: resellerRenderRequest.selectedSkuIds,
			customerId: 'customer-2',
			iat: 1,
			exp: 9999999,
			jti: 'jti-1',
		});

		await expect(
			service.renderOpportunitiesPdf({
				customerId: 'customer-2',
				dlToken: 'token-2',
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('records telemetry when token verification fails', async () => {
		const {
			dashboardService,
			dlTokenService,
			pdfRenderer,
			proposalAssetService,
		} = createServiceMocks();

		dlTokenService.verifyTokenForScope.mockImplementation(() => {
			throw new UnauthorizedException('Invalid token');
		});

		const telemetry = {
			recordOperationSuccess: vi.fn(),
			recordOperationFailure: vi.fn(),
			recordTokenVerificationFailure: vi.fn(),
		};

		const service = new PdfService(
			dashboardService as never,
			dlTokenService as never,
			pdfRenderer as never,
			proposalAssetService as never,
			telemetry as never,
		);

		await expect(
			service.renderResellerListPdfFromToken('tampered-token'),
		).rejects.toBeInstanceOf(UnauthorizedException);

		expect(telemetry.recordTokenVerificationFailure).toHaveBeenCalledWith(
			'401_UnauthorizedException',
		);
		expect(telemetry.recordOperationFailure).toHaveBeenCalledWith(
			'render-reseller-list',
			expect.any(Number),
			'401_UnauthorizedException',
		);
	});
});
