import { describe, expect, it, vi } from 'vitest';
import { PdfController } from './pdf.controller';

describe('PdfController audit context', () => {
	const baseFilters = {
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
	};
	const baseSort = {
		sortBy: 'totalARR',
		sortDir: 'descending',
	} as const;

	function createController() {
		const pdfService = {
			createListLink: vi.fn().mockReturnValue({
				url: 'https://example.com/list.pdf',
			}),
		} as any;
		const pdfAsyncService = {
			createAsyncJob: vi.fn(),
			findJobByToken: vi.fn(),
			getJobParts: vi.fn((parts: unknown) => parts),
		} as any;
		const blobStorage = {
			download: vi.fn(),
		} as any;
		const auditService = {
			recordEvent: vi.fn().mockResolvedValue(undefined),
		} as any;

		const pdfChunkService = {} as any;
		const demoDataService = {} as any;
		const pdfRenderer = {} as any;
		const proposalAssetService = {} as any;
		const resellerCustomersService = {} as any;
		const dlTokenService = {
			readTokenPayload: vi.fn(),
			assertTokenAvailable: vi.fn().mockResolvedValue(undefined),
			consumeToken: vi.fn().mockResolvedValue(undefined),
		} as any;
		const adminAnalyticsDownloadTrackingService = {
			recordIssuance: vi.fn().mockResolvedValue(undefined),
			recordCustomerListJobCreated: vi.fn().mockResolvedValue(undefined),
			recordResellerListJobCreated: vi.fn().mockResolvedValue(undefined),
			recordCustomerListDownload: vi.fn().mockResolvedValue(undefined),
			recordResellerListDownload: vi.fn().mockResolvedValue(undefined),
			hasFactForTokenJti: vi.fn().mockResolvedValue(false),
		} as any;

		return {
			controller: new PdfController(
				pdfService,
				pdfAsyncService,
				pdfChunkService,
				blobStorage,
				auditService,
				demoDataService,
				pdfRenderer,
				proposalAssetService,
				resellerCustomersService,
				dlTokenService,
				adminAnalyticsDownloadTrackingService,
			),
			pdfService,
			pdfAsyncService,
			blobStorage,
			auditService,
			dlTokenService,
			adminAnalyticsDownloadTrackingService,
		};
	}

	it('records authenticated list-link audit events with the real tenant and stable user id', () => {
		const { controller, auditService } = createController();

		controller.createListLink(
			{
				viewMode: 'reseller',
				filters: baseFilters,
				sort: baseSort,
				selectedSkuIds: ['sku-1'],
			},
			{
				userId: 'user-1',
				email: 'Casey.Admin@Example.com',
				canonicalEmail: 'casey.admin@example.com',
				claimEmail: 'casey.admin@example.com',
				preferredUsername: 'casey.admin@example.com',
				subjectId: 'opaque-sub',
				tenantId: 'tenant-123',
				entraObjectId: 'entra-1',
			},
		);

		expect(auditService.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				eventName: 'pdf.list_link.create.success',
				actorType: 'user',
				actorId: 'user-1',
				tenantId: 'tenant-123',
			}),
		);
	});

	it('keeps anonymous list-link audit events on the default tenant', () => {
		const { controller, auditService } = createController();

		controller.createListLink({
			viewMode: 'customer',
			filters: baseFilters,
			sort: baseSort,
			selectedSkuIds: ['sku-1'],
		});

		expect(auditService.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				eventName: 'pdf.list_link.create.success',
				actorType: 'anonymous',
				actorId: null,
				tenantId: 'default-tenant',
			}),
		);
	});

	it('records internal async list analytics when a reseller job is created', async () => {
		const {
			controller,
			pdfAsyncService,
			dlTokenService,
			adminAnalyticsDownloadTrackingService,
		} = createController();
		const tokenPayload = {
			jti: 'token-jti-1',
			scope: 'reseller-list',
			tenantId: 'default-tenant',
			filters: baseFilters,
			sort: baseSort,
			selectedSkuIds: ['sku-1'],
			iat: 1,
			exp: 2,
			v: 2,
		};

		pdfAsyncService.createAsyncJob.mockResolvedValue({
			id: 'job-1',
			dlToken: 'token-1',
			totalRows: 25,
			totalChunks: 1,
			totalParts: 1,
		});
		dlTokenService.readTokenPayload.mockReturnValue(tokenPayload);

		await controller.createListLinkAsync(
			{
				viewMode: 'reseller',
				filters: baseFilters,
				sort: baseSort,
				selectedSkuIds: ['sku-1'],
			},
			{
				userId: 'user-1',
				email: 'Casey.Admin@Example.com',
				canonicalEmail: 'casey.admin@example.com',
				claimEmail: 'casey.admin@example.com',
				preferredUsername: 'casey.admin@example.com',
				subjectId: 'opaque-sub',
				tenantId: 'tenant-123',
				entraObjectId: 'entra-1',
			},
		);

		expect(
			adminAnalyticsDownloadTrackingService.recordResellerListJobCreated,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				tokenPayload,
				actorId: 'user-1',
				tenantId: 'tenant-123',
				requestId: null,
				route: null,
			}),
		);
	});

	it('skips async download-time list analytics when the job was already counted at creation', async () => {
		const {
			controller,
			pdfAsyncService,
			blobStorage,
			dlTokenService,
			adminAnalyticsDownloadTrackingService,
		} = createController();
		const tokenPayload = {
			jti: 'token-jti-2',
			scope: 'customer-list',
			tenantId: 'default-tenant',
			filters: baseFilters,
			sort: baseSort,
			selectedSkuIds: [],
			iat: 1,
			exp: Math.floor(Date.now() / 1000) + 3_600,
			v: 2,
		};

		dlTokenService.readTokenPayload.mockReturnValue(tokenPayload);
		pdfAsyncService.findJobByToken.mockResolvedValue({
			id: 'job-2',
			status: 'completed',
			expiresAt: new Date(Date.now() + 60_000),
			parts: [
				{
					partNumber: 1,
					blobName: 'job-2.pdf',
					blobUrl: 'https://blob.example/job-2.pdf',
					fileName: 'customer-list.pdf',
					status: 'completed',
				},
			],
		});
		blobStorage.download.mockResolvedValue(Buffer.from('pdf'));
		adminAnalyticsDownloadTrackingService.hasFactForTokenJti.mockResolvedValue(
			true,
		);

		const response = {
			setHeader: vi.fn(),
			send: vi.fn(),
		};

		await controller.renderAsyncCustomerList('token-2', response as never);

		expect(
			adminAnalyticsDownloadTrackingService.hasFactForTokenJti,
		).toHaveBeenCalledWith('token-jti-2');
		expect(
			adminAnalyticsDownloadTrackingService.recordCustomerListDownload,
		).not.toHaveBeenCalled();
	});
});
