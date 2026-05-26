import { describe, expect, it, vi } from 'vitest';
import { ResellerPdfController } from './reseller-pdf.controller';

describe('ResellerPdfController', () => {
	it('records reseller async customer-list analytics when a job is created', async () => {
		const pdfAsyncService = {
			createResellerCustomerAsyncJob: vi.fn().mockResolvedValue({
				id: 'job-1',
				dlToken: 'token-1',
				totalChunks: 1,
				totalParts: 1,
			}),
		} as any;
		const resellerCustomersService = {
			getExportRowCount: vi.fn().mockResolvedValue(42),
		} as any;
		const auditService = {
			recordEvent: vi.fn().mockResolvedValue(undefined),
		} as any;
		const dlTokenService = {
			readTokenPayload: vi.fn().mockReturnValue({
				jti: 'token-jti-1',
				scope: 'customer-list',
				tenantId: 'default-tenant',
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
					sortBy: 'createdAt',
					sortDir: 'descending',
				},
				selectedSkuIds: [],
				iat: 1,
				exp: 2,
				v: 2,
			}),
		} as any;
		const adminAnalyticsDownloadTrackingService = {
			recordResellerCustomerListJobCreated: vi.fn().mockResolvedValue(undefined),
		} as any;

		const controller = new ResellerPdfController(
			pdfAsyncService,
			resellerCustomersService,
			auditService,
			dlTokenService,
			adminAnalyticsDownloadTrackingService,
		);

		await controller.createListLinkAsync(
			{
				filters: {
					customerName: ['Contoso'],
					currentSku: ['Business Basic'],
					region: ['US'],
					seats: ['<50'],
					currentArr: ['$100,000-$200,000'],
					renewalDate: ['Within 1 month'],
				},
				sort: {
					sortBy: 'createdAt',
					sortDir: 'descending',
				},
			},
			{
				userType: 'reseller',
				userId: 'reseller-user-1',
				orgId: 'org-1',
				tenantId: 'org-1',
				email: 'owner@example.com',
				canonicalEmail: 'owner@example.com',
				name: 'Owner',
				provider: 'entra',
				providerSubject: 'provider-subject',
				issuer: 'https://issuer.example.com',
				externalTenantId: 'external-tenant',
				displayName: 'Owner',
			},
		);

		expect(
			adminAnalyticsDownloadTrackingService.recordResellerCustomerListJobCreated,
		).toHaveBeenCalledWith(
			expect.objectContaining({
				tokenPayload: expect.objectContaining({
					jti: 'token-jti-1',
					scope: 'customer-list',
				}),
				orgId: 'org-1',
				resellerFilters: {
					customerName: ['Contoso'],
					currentSku: ['Business Basic'],
					region: ['US'],
					seats: ['<50'],
					currentArr: ['$100,000-$200,000'],
					renewalDate: ['Within 1 month'],
				},
				actorId: 'reseller-user-1',
				tenantId: 'org-1',
				requestId: null,
				route: null,
			}),
		);
	});
});
