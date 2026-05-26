import { vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { ResellerCustomersService } from '../reseller-customers/reseller-customers.service';
import { EmailController } from './email.controller';
import { ProposalGenerationTrackingService } from './proposal-generation-tracking.service';
import { ProposalOptionsEmailService } from './proposal-options-email.service';

describe('EmailController', () => {
	function makeSubscription(overrides: Record<string, unknown> = {}) {
		return {
			customerId: 'cust-1',
			subscriptionId: 'sub-1',
			customerName: 'Contoso',
			resellerName: 'Reseller A',
			distributorName: 'Distributor A',
			pssAIWorkforceName: 'PSS A',
			pssAISecurityName: '',
			psaName: '',
			pdmName: 'PDM A',
			pmmName: 'PMM A',
			currentProduct: 'Business Standard',
			type: '',
			skuCategory: 'Standard',
			seatCount: 40,
			annualRevenueRunRate: 6000,
			renewalDate: '2026-12-01',
			termMonths: 12,
			autoRenew: false,
			multiYear: false,
			hasCopilot: false,
			hasPurview: false,
			hasSureStep: false,
			currentMargin: 0,
			customerSegment: '',
			region: 'United States',
			notes: '',
			...overrides,
		};
	}

	function createController() {
		const emailService = {
			createOpportunityListEmailLink: vi.fn(),
			createProposalOptionsEmailLink: vi.fn(),
			createCustomerProposalEmailLink: vi.fn(),
			createPartnerProposalEmailLink: vi.fn(),
			createProposalAssetsBundleLink: vi.fn(),
			createProposalPptSession: vi.fn(),
			createSyntheticSubscriptionForNewCustomer: vi.fn(),
			loadProposalAssetsFromSubscriptions: vi.fn(),
			generateProposalLineItemAssetFromSubscriptions: vi.fn(),
			renderOpportunityListEmailFromToken: vi.fn(),
			renderProposalOptionsEmailFromToken: vi.fn(),
			renderCustomerProposalEmailFromToken: vi.fn(),
			renderPartnerProposalEmailFromToken: vi.fn(),
			renderProposalAssetsBundleFromToken: vi.fn(),
			renderProposalPptFromToken: vi.fn(),
		} as unknown as ProposalOptionsEmailService;
		const auditService = {
			recordEvent: vi.fn().mockResolvedValue(undefined),
		} as unknown as AuditService;
		const proposalGenerationTrackingService = {
			recordLoadSuccess: vi.fn().mockResolvedValue(undefined),
		} as unknown as ProposalGenerationTrackingService;
		const resellerCustomersService = {
			findSubscriptionsByCustomerName: vi.fn(),
		} as unknown as ResellerCustomersService;

		const mailService = {
			sendPdfPasswordEmail: vi.fn(),
		} as unknown as import('../mail/mail.service').MailService;
		const pdfAsyncService = {
			getJobByIdForOwner: vi.fn(),
			getJobPasswordForProcessing: vi.fn(),
			revealJobPasswordForOwner: vi.fn(),
		} as unknown as import('../pdf/pdf-async.service').PdfAsyncService;

		const controller = new EmailController(
			emailService,
			auditService,
			resellerCustomersService,
			proposalGenerationTrackingService,
			mailService,
			pdfAsyncService,
		);
		return {
			controller,
			emailService,
			auditService,
			resellerCustomersService,
			proposalGenerationTrackingService,
		};
	}

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates proposal-options link from multipart payload and screenshot', async () => {
		const { controller, emailService } = createController();
		const createSpy = vi
			.spyOn(emailService, 'createProposalOptionsEmailLink')
			.mockResolvedValue({
				url: 'https://example.com/download.docx',
				expiresAt: '2026-02-22T00:10:00.000Z',
			});

		const result = await controller.createProposalOptionsLink(
			JSON.stringify({
				journey: 'renewal',
				filter: 'ai',
				customerId: 'cust-1',
				customerName: 'Contoso',
				opportunityId: 'opp-1',
				startingSkuId: 'bs',
				startingSkuName: 'Business Standard',
				seats: 40,
				expiringArr: 6000,
				renewalDate: '2026-12-01',
				selectedEndingSkuIds: ['bs_cb'],
			}),
			{
				originalname: 'cards.png',
				mimetype: 'image/png',
				size: 128,
				buffer: Buffer.from('png'),
			},
		);

		expect(createSpy).toHaveBeenCalledWith({
			payload: expect.objectContaining({
				journey: 'renewal',
				filter: 'ai',
				customerId: 'cust-1',
				selectedEndingSkuIds: ['bs_cb'],
			}),
			screenshotFile: expect.objectContaining({
				mimetype: 'image/png',
			}),
		});
		expect(result).toEqual({
			url: 'https://example.com/download.docx',
			expiresAt: '2026-02-22T00:10:00.000Z',
		});
	});

	it('rejects invalid JSON in multipart payload', async () => {
		const { controller } = createController();

		await expect(
			controller.createProposalOptionsLink('{invalid-json', undefined),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('creates opportunity-list email link', () => {
		const { controller, emailService } = createController();
		const createSpy = vi
			.spyOn(emailService, 'createOpportunityListEmailLink')
			.mockReturnValue({
				url: 'https://example.com/opportunity-email.docx',
				expiresAt: '2026-02-22T00:10:00.000Z',
			});

		const result = controller.createOpportunityListLink({
			viewMode: 'reseller',
			resellerCount: 10,
			customerCount: 25,
			totalRenewals: 100,
			totalSeats: 1_250,
			expiringArr: 5_500_000,
			selectedSkuIds: ['bs_cb', 'bp_cb'],
		});

		expect(createSpy).toHaveBeenCalledWith({
			viewMode: 'reseller',
			resellerCount: 10,
			customerCount: 25,
			totalRenewals: 100,
			totalSeats: 1_250,
			expiringArr: 5_500_000,
			selectedSkuIds: ['bs_cb', 'bp_cb'],
		});
		expect(result.url).toBe('https://example.com/opportunity-email.docx');
	});

	it('records authenticated opportunity-list audit events with the real tenant and stable user id', () => {
		const { controller, auditService, emailService } = createController();
		vi.spyOn(emailService, 'createOpportunityListEmailLink').mockReturnValue({
			url: 'https://example.com/opportunity-email.docx',
			expiresAt: '2026-02-22T00:10:00.000Z',
		});

		controller.createOpportunityListLink(
			{
				viewMode: 'reseller',
				resellerCount: 10,
				customerCount: 25,
				totalRenewals: 100,
				totalSeats: 1_250,
				expiringArr: 5_500_000,
				selectedSkuIds: ['bs_cb', 'bp_cb'],
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
				eventName: 'email.opportunity_list.link.create.success',
				actorType: 'user',
				actorId: 'user-1',
				tenantId: 'tenant-123',
			}),
		);
	});

	it('keeps anonymous opportunity-list audit events on the default tenant', () => {
		const { controller, auditService, emailService } = createController();
		vi.spyOn(emailService, 'createOpportunityListEmailLink').mockReturnValue({
			url: 'https://example.com/opportunity-email.docx',
			expiresAt: '2026-02-22T00:10:00.000Z',
		});

		controller.createOpportunityListLink({
			viewMode: 'customer',
			resellerCount: 1,
			customerCount: 1,
			totalRenewals: 1,
			totalSeats: 25,
			expiringArr: 50_000,
			selectedSkuIds: ['bs_cb'],
		});

		expect(auditService.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				eventName: 'email.opportunity_list.link.create.success',
				actorType: 'anonymous',
				actorId: null,
				tenantId: 'default-tenant',
			}),
		);
	});

	it('creates customer-proposal email link', () => {
		const { controller, emailService } = createController();
		const createSpy = vi
			.spyOn(emailService, 'createCustomerProposalEmailLink')
			.mockReturnValue({
				url: 'https://example.com/customer-proposal-email.docx',
				expiresAt: '2026-02-22T00:10:00.000Z',
			});

		const result = controller.createCustomerProposalLink({
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bs_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});

		expect(createSpy).toHaveBeenCalledWith({
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bs_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});
		expect(result.url).toBe('https://example.com/customer-proposal-email.docx');
	});

	it('creates partner-proposal email link', () => {
		const { controller, emailService } = createController();
		const createSpy = vi
			.spyOn(emailService, 'createPartnerProposalEmailLink')
			.mockReturnValue({
				url: 'https://example.com/partner-proposal-email.docx',
				expiresAt: '2026-02-22T00:10:00.000Z',
			});

		const result = controller.createPartnerProposalLink({
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bs_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});

		expect(createSpy).toHaveBeenCalledWith({
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bs_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});
		expect(result.url).toBe('https://example.com/partner-proposal-email.docx');
	});

	it('creates proposal-assets bundle link', () => {
		const { controller, emailService } = createController();
		const createSpy = vi
			.spyOn(emailService, 'createProposalAssetsBundleLink')
			.mockReturnValue({
				url: 'https://example.com/proposal-assets.zip',
				expiresAt: '2026-02-22T00:10:00.000Z',
			});

		const result = controller.createProposalAssetsBundleLink({
			mode: 'consolidated',
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			fileName: 'contoso-consolidated-proposals.pptx',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 30,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});

		expect(createSpy).toHaveBeenCalledWith({
			mode: 'consolidated',
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			fileName: 'contoso-consolidated-proposals.pptx',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 30,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});
		expect(result.url).toBe('https://example.com/proposal-assets.zip');
	});

	it('passes issuance context when creating a proposal-assets bundle link', () => {
		const { controller, emailService } = createController();
		const createSpy = vi
			.spyOn(emailService, 'createProposalAssetsBundleLink')
			.mockReturnValue({
				url: 'https://example.com/proposal-assets.zip',
				expiresAt: '2026-02-22T00:10:00.000Z',
			});

		controller.createProposalAssetsBundleLink(
			{
				mode: 'consolidated',
				journey: 'renewal',
				customerId: 'cust-1',
				customerName: 'Contoso',
				fileName: 'contoso-consolidated-proposals.pptx',
				scenarios: [
					{
						opportunityId: 'opp-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bp_cb',
						selectedSeats: 30,
						originalSeats: 40,
						expiringArr: 6_000,
					},
				],
			},
			{
				userId: 'user-1',
				tenantId: 'tenant-1',
				email: 'test@example.com',
				canonicalEmail: 'test@example.com',
				claimEmail: 'test@example.com',
				preferredUsername: 'test@example.com',
				subjectId: 'subject-1',
				entraObjectId: 'entra-1',
			} as never,
			{
				method: 'POST',
				originalUrl: '/api/email/proposal-assets/link',
				requestContext: {
					requestId: 'req-1',
					startedAtMs: Date.now(),
				},
			} as never,
		);

		expect(createSpy).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				actorId: 'user-1',
				tenantId: 'tenant-1',
				requestId: 'req-1',
				route: '/api/email/proposal-assets/link',
			}),
		);
	});

	it('creates proposal-ppt session', () => {
		const { controller, emailService } = createController();
		const createSpy = vi
			.spyOn(emailService, 'createProposalPptSession')
			.mockReturnValue({
				token: 'ppt-token',
				renderUrl: 'https://example.com/ppt/render',
				downloadUrl: 'https://example.com/ppt/download',
				expiresAt: '2026-02-22T00:10:00.000Z',
			});

		const result = controller.createProposalPptSession({
			mode: 'single',
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			fileName: 'contoso-proposal.pptx',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 30,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});

		expect(createSpy).toHaveBeenCalledWith({
			mode: 'single',
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			fileName: 'contoso-proposal.pptx',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 30,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});
		expect(result).toEqual({
			token: 'ppt-token',
			renderUrl: 'https://example.com/ppt/render',
			downloadUrl: 'https://example.com/ppt/download',
			expiresAt: '2026-02-22T00:10:00.000Z',
		});
	});

	it('passes issuance context when creating a proposal-ppt session', () => {
		const { controller, emailService } = createController();
		const createSpy = vi
			.spyOn(emailService, 'createProposalPptSession')
			.mockReturnValue({
				token: 'ppt-token',
				renderUrl: 'https://example.com/ppt/render',
				downloadUrl: 'https://example.com/ppt/download',
				expiresAt: '2026-02-22T00:10:00.000Z',
			});

		controller.createProposalPptSession(
			{
				mode: 'single',
				journey: 'renewal',
				customerId: 'cust-1',
				customerName: 'Contoso',
				fileName: 'contoso-proposal.pptx',
				scenarios: [
					{
						opportunityId: 'opp-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bp_cb',
						selectedSeats: 30,
						originalSeats: 40,
						expiringArr: 6_000,
					},
				],
			},
			{
				userId: 'user-1',
				tenantId: 'tenant-1',
				email: 'test@example.com',
				canonicalEmail: 'test@example.com',
				claimEmail: 'test@example.com',
				preferredUsername: 'test@example.com',
				subjectId: 'subject-1',
				entraObjectId: 'entra-1',
			} as never,
			{
				method: 'POST',
				originalUrl: '/api/email/proposal-ppt/session',
				requestContext: {
					requestId: 'req-2',
					startedAtMs: Date.now(),
				},
			} as never,
		);

		expect(createSpy).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				actorId: 'user-1',
				tenantId: 'tenant-1',
				requestId: 'req-2',
				route: '/api/email/proposal-ppt/session',
			}),
		);
	});

	it('loads proposal assets for public snapshot requests', async () => {
		const { controller, emailService } = createController();
		const loadSpy = vi
			.spyOn(emailService, 'loadProposalAssetsFromSubscriptions')
			.mockResolvedValue({
				customer: { customerId: 'cust-1', customerName: 'Contoso' },
				selectedScenarios: [
					{
						opportunityId: 'cust-1:sub-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bs_cb',
						selectedSeats: 30,
						originalSeats: 40,
						expiringArr: 6000,
					},
				],
				summary: {
					currentAnnual: 6000,
					listAnnual: 9000,
					offerAnnual: 8100,
					promoSavings: 900,
					incrementalCost: 2100,
					incrementalIncentive: 300,
				},
				assets: {
					consolidated: {
						blobUrl: 'https://blob.example.com/consolidated.pptx',
						fileName: 'contoso_consolidated_proposals.pptx',
					},
					lineItems: [
						{
							opportunityId: 'cust-1:sub-1',
							endingSkuId: 'bs_cb',
							selectedSeats: 30,
							label: 'Proposal Document - BS to BS + CB - 30 Seats',
							fileName: 'proposal_document_bs_to_bs_cb_30_seats.pptx',
							status: 'not_generated' as const,
						},
					],
					bundleDownloadUrl: '/api/email/proposal-assets/download?dlToken=abc',
					uploadedAt: '2026-02-22T00:10:00.000Z',
				},
			});

		const result = await controller.loadProposalAssetsPublic({
			journey: 'new_customer',
			customerSnapshot: {
				customerId: 'cust-1',
				customerName: 'Contoso',
				subscriptions: [makeSubscription()],
			},
			selections: [
				{
					opportunityId: 'cust-1:sub-1',
					endingSkuId: 'bs_cb',
					seats: 30,
				},
			],
		});

		expect(loadSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				journey: 'new_customer',
				customerId: 'cust-1',
			}),
		);
		expect(result.customer.customerId).toBe('cust-1');
	});

	it('loads multi-scenario proposal assets for public new-customer requests', async () => {
		const { controller, emailService } = createController();
		const loadSpy = vi
			.spyOn(emailService, 'loadProposalAssetsFromSubscriptions')
			.mockResolvedValue({
				customer: { customerId: 'cust-1', customerName: 'Northwind' },
				selectedScenarios: [
					{
						opportunityId: 'cust-1:local-cust-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bs_cb',
						selectedSeats: 50,
						originalSeats: 50,
						expiringArr: 42960,
						region: 'Brazil',
					},
					{
						opportunityId: 'cust-1:local-cust-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bp_cb',
						selectedSeats: 50,
						originalSeats: 50,
						expiringArr: 42960,
						region: 'Brazil',
					},
				],
				summary: {
					currentAnnual: 85920,
					listAnnual: 185580,
					offerAnnual: 185580,
					promoSavings: 0,
					incrementalCost: 99660,
					incrementalIncentive: 0,
				},
				pricingContext: {
					region: 'Brazil',
					country: 'BR',
					currency: 'BRL',
					currencySymbol: 'R$',
					locale: 'pt-BR',
					fallbackApplied: false,
					fallbackReason: 'none',
				},
				assets: {
					consolidated: {
						blobUrl: 'https://blob.example.com/consolidated.pptx',
						fileName: 'northwind_consolidated_proposals.pptx',
					},
					lineItems: [
						{
							opportunityId: 'cust-1:local-cust-1',
							endingSkuId: 'bs_cb',
							selectedSeats: 50,
							label: 'Proposal Document 1 - BS to BS + CB - 50 Seats',
							fileName: 'proposal_document_1_bs_to_bs_cb_50_seats.pptx',
							status: 'not_generated' as const,
						},
						{
							opportunityId: 'cust-1:local-cust-1',
							endingSkuId: 'bp_cb',
							selectedSeats: 50,
							label: 'Proposal Document 2 - BS to BP + CB - 50 Seats',
							fileName: 'proposal_document_2_bs_to_bp_cb_50_seats.pptx',
							status: 'not_generated' as const,
						},
					],
					bundleDownloadUrl: '/api/email/proposal-assets/download?dlToken=abc',
					uploadedAt: '2026-02-22T00:10:00.000Z',
				},
			});

		const result = await controller.loadProposalAssetsPublic({
			journey: 'new_customer',
			customerSnapshot: {
				customerId: 'cust-1',
				customerName: 'Northwind',
				subscriptions: [
					makeSubscription({
						customerId: 'cust-1',
						subscriptionId: 'local-cust-1',
						customerName: 'Northwind',
						seatCount: 100,
						annualRevenueRunRate: 85920,
						region: 'Brazil',
					}),
				],
			},
			selections: [
				{
					opportunityId: 'cust-1:local-cust-1',
					endingSkuId: 'bs_cb',
					seats: 50,
				},
				{
					opportunityId: 'cust-1:local-cust-1',
					endingSkuId: 'bp_cb',
					seats: 50,
				},
			],
		});

		expect(loadSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				journey: 'new_customer',
				customerId: 'cust-1',
				customerName: 'Northwind',
				selections: [
					{
						opportunityId: 'cust-1:local-cust-1',
						endingSkuId: 'bs_cb',
						seats: 50,
					},
					{
						opportunityId: 'cust-1:local-cust-1',
						endingSkuId: 'bp_cb',
						seats: 50,
					},
				],
			}),
		);
		expect(result.assets.lineItems).toHaveLength(2);
		expect(result.assets.consolidated?.fileName).toBe(
			'northwind_consolidated_proposals.pptx',
		);
	});

	it('generates a line-item proposal asset for public requests', async () => {
		const { controller, emailService } = createController();
		const generateSpy = vi
			.spyOn(emailService, 'generateProposalLineItemAssetFromSubscriptions')
			.mockResolvedValue({
				opportunityId: 'cust-1:sub-1',
				endingSkuId: 'bs_cb',
				selectedSeats: 30,
				label: 'Proposal Document - BS to BS + CB - 30 Seats',
				fileName: 'proposal_document_bs_to_bs_cb_30_seats.pptx',
				blobUrl:
					'https://blob.example.com/proposal_document_bs_to_bs_cb_30_seats.pptx',
				uploadedAt: '2026-02-22T00:10:00.000Z',
			});

		const result = await controller.generateProposalAssetsLineItemPublic({
			journey: 'renewal',
			customerSnapshot: {
				customerId: 'cust-1',
				customerName: 'Contoso',
				subscriptions: [makeSubscription()],
			},
			selection: {
				opportunityId: 'cust-1:sub-1',
				endingSkuId: 'bs_cb',
				seats: 30,
			},
			selectionContext: [
				{
					opportunityId: 'cust-1:sub-1',
					endingSkuId: 'bs_cb',
					seats: 30,
				},
			],
		});

		expect(generateSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				journey: 'renewal',
				customerId: 'cust-1',
				selection: {
					opportunityId: 'cust-1:sub-1',
					endingSkuId: 'bs_cb',
					seats: 30,
				},
				selectionContext: [
					{
						opportunityId: 'cust-1:sub-1',
						endingSkuId: 'bs_cb',
						seats: 30,
					},
				],
			}),
		);
		expect(result.fileName).toBe('proposal_document_bs_to_bs_cb_30_seats.pptx');
	});

	it('streams rendered proposal-options email as attachment', async () => {
		const { controller, emailService } = createController();
		const renderSpy = vi
			.spyOn(emailService, 'renderProposalOptionsEmailFromToken')
			.mockResolvedValue(Buffer.from('docx'));

		const response = {
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		} as unknown as Response;

		await controller.downloadProposalOptionsEmail('token-1', response);

		expect(renderSpy).toHaveBeenCalledWith('token-1');
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'attachment; filename="proposal-options-email.docx"',
		);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.send).toHaveBeenCalledWith(Buffer.from('docx'));
	});

	it('streams rendered opportunity-list email as attachment', async () => {
		const { controller, emailService } = createController();
		const renderSpy = vi
			.spyOn(emailService, 'renderOpportunityListEmailFromToken')
			.mockResolvedValue(Buffer.from('docx'));

		const response = {
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		} as unknown as Response;

		await controller.downloadOpportunityListEmail('token-2', response);

		expect(renderSpy).toHaveBeenCalledWith('token-2');
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'attachment; filename="opportunity-list-email.docx"',
		);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.send).toHaveBeenCalledWith(Buffer.from('docx'));
	});

	it('streams rendered customer-proposal email as attachment', async () => {
		const { controller, emailService } = createController();
		const renderSpy = vi
			.spyOn(emailService, 'renderCustomerProposalEmailFromToken')
			.mockResolvedValue(Buffer.from('docx'));

		const response = {
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		} as unknown as Response;

		await controller.downloadCustomerProposalEmail('token-3', response);

		expect(renderSpy).toHaveBeenCalledWith('token-3');
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'attachment; filename="customer-proposal-email.docx"',
		);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.send).toHaveBeenCalledWith(Buffer.from('docx'));
	});

	it('streams rendered partner-proposal email as attachment', async () => {
		const { controller, emailService } = createController();
		const renderSpy = vi
			.spyOn(emailService, 'renderPartnerProposalEmailFromToken')
			.mockResolvedValue(Buffer.from('docx'));

		const response = {
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		} as unknown as Response;

		await controller.downloadPartnerProposalEmail('token-4', response);

		expect(renderSpy).toHaveBeenCalledWith('token-4');
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'attachment; filename="partner-proposal-email.docx"',
		);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.send).toHaveBeenCalledWith(Buffer.from('docx'));
	});

	it('streams proposal assets bundle as attachment', async () => {
		const { controller, emailService } = createController();
		const renderSpy = vi
			.spyOn(emailService, 'renderProposalAssetsBundleFromToken')
			.mockResolvedValue({
				fileName: 'contoso-proposal-assets.zip',
				buffer: Buffer.from('zip'),
			});

		const response = {
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		} as unknown as Response;

		await controller.downloadProposalAssetsBundle(
			'assets-token',
			undefined,
			response,
		);

		expect(renderSpy).toHaveBeenCalledWith('assets-token', undefined);
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'attachment; filename="contoso-proposal-assets.zip"',
		);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.send).toHaveBeenCalledWith(Buffer.from('zip'));
	});

	it('streams rendered proposal-ppt as inline', async () => {
		const { controller, emailService } = createController();
		const renderSpy = vi
			.spyOn(emailService, 'renderProposalPptFromToken')
			.mockResolvedValue({
				fileName: 'contoso-proposal.pptx',
				buffer: Buffer.from('pptx'),
			});

		const response = {
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		} as unknown as Response;

		await controller.renderProposalPpt('ppt-token', response);

		expect(renderSpy).toHaveBeenCalledWith('ppt-token');
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'inline; filename="contoso-proposal.pptx"',
		);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.send).toHaveBeenCalledWith(Buffer.from('pptx'));
	});

	it('streams proposal-ppt as attachment', async () => {
		const { controller, emailService } = createController();
		const renderSpy = vi
			.spyOn(emailService, 'renderProposalPptFromToken')
			.mockResolvedValue({
				fileName: 'contoso-proposal.pptx',
				buffer: Buffer.from('pptx'),
			});

		const response = {
			setHeader: vi.fn(),
			status: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		} as unknown as Response;

		await controller.downloadProposalPpt('ppt-token', response);

		expect(renderSpy).toHaveBeenCalledWith('ppt-token');
		expect(response.setHeader).toHaveBeenCalledWith(
			'Content-Disposition',
			'attachment; filename="contoso-proposal.pptx"',
		);
		expect(response.status).toHaveBeenCalledWith(200);
		expect(response.send).toHaveBeenCalledWith(Buffer.from('pptx'));
	});

	it('rejects reseller user accessing dashboard customerSource', async () => {
		const { controller } = createController();

		await expect(
			controller.loadProposalAssets(
				{
					journey: 'renewal',
					customerId: 'cust-1',
					customerSource: 'dashboard',
					selections: [
						{
							opportunityId: 'cust-1:sub-1',
							endingSkuId: 'bs_cb',
							seats: 30,
						},
					],
				},
				{
					userType: 'reseller',
					userId: 'reseller-user-1',
					email: 'reseller@example.com',
					canonicalEmail: 'reseller@example.com',
					tenantId: 'tenant-1',
					orgId: 'org-1',
					provider: 'entra',
					providerSubject: 'sub-1',
					issuer: null,
					externalTenantId: null,
					displayName: 'Reseller User',
				} as never,
			),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('rejects internal user accessing reseller_customer customerSource', async () => {
		const { controller } = createController();

		await expect(
			controller.loadProposalAssets(
				{
					journey: 'renewal',
					customerId: 'cust-1',
					customerSource: 'reseller_customer',
					selections: [
						{
							opportunityId: 'cust-1:sub-1',
							endingSkuId: 'bs_cb',
							seats: 30,
						},
					],
				},
				{
					userType: 'internal',
					userId: 'user-1',
					email: 'test@example.com',
					canonicalEmail: 'test@example.com',
					claimEmail: 'test@example.com',
					preferredUsername: 'test@example.com',
					subjectId: 'subject-1',
					tenantId: 'tenant-1',
					entraObjectId: 'entra-1',
					orgId: null,
					roles: ['MEMBER'],
				} as never,
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
