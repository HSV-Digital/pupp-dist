import { vi } from 'vitest';
import { GoneException, UnauthorizedException } from '@nestjs/common';
import { DlTokenService } from './dl-token.service';

describe('DlTokenService', () => {
	const baseInput = {
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

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates and verifies a valid scope-bound token', () => {
		const service = new DlTokenService();
		const token = service.createToken({
			...baseInput,
			scope: 'customer-list',
			resellerId: 'reseller-a',
		});

		const payload = service.verifyTokenForScope({
			token,
			scope: 'customer-list',
			resellerId: 'reseller-a',
		});

		expect(payload.scope).toBe('customer-list');
		expect(payload.resellerId).toBe('reseller-a');
		expect(payload.selectedSkuIds).toEqual(['bp_cb']);
	});

	it('creates and verifies reseller-list scope tokens', () => {
		const service = new DlTokenService();
		const token = service.createToken({
			...baseInput,
			scope: 'reseller-list',
		});

		const payload = service.verifyTokenForScope({
			token,
			scope: 'reseller-list',
		});

		expect(payload.scope).toBe('reseller-list');
		expect(payload.resellerId).toBeUndefined();
		expect(payload.customerId).toBeUndefined();
	});

	it('preserves opportunity-list email payload in token', () => {
		const service = new DlTokenService();
		const token = service.createToken({
			...baseInput,
			scope: 'opportunity-list-email',
			opportunityListEmail: {
				templatePath:
					'/email_templates/partner/opportunity_list/reseller_list/ai.docx',
				viewMode: 'reseller',
				resellerCount: 10,
				customerCount: 20,
				totalRenewals: 30,
				totalSeats: 40,
				expiringArr: 500000,
				url: 'https://pupp.cloud-programs.com/csp-partners',
				solutions: [
					{
						solutionName: 'Business Standard + Copilot Business',
						bestFor: 'Best for productivity',
					},
				],
			},
		});

		const payload = service.verifyTokenForScope({
			token,
			scope: 'opportunity-list-email',
		});

		expect(payload.opportunityListEmail).toBeDefined();
		expect(payload.opportunityListEmail?.viewMode).toBe('reseller');
		expect(payload.opportunityListEmail?.templatePath).toContain(
			'/opportunity_list/reseller_list/ai.docx',
		);
	});

	it('preserves proposal-ppt payload in token', () => {
		const service = new DlTokenService();
		const token = service.createToken({
			...baseInput,
			scope: 'proposal-ppt',
			customerId: 'cust-1',
			proposalPpt: {
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
						expiringArr: 6000,
					},
				],
			},
		});

		const payload = service.verifyTokenForScope({
			token,
			scope: 'proposal-ppt',
			customerId: 'cust-1',
		});

		expect(payload.proposalPpt).toBeDefined();
		expect(payload.proposalPpt?.mode).toBe('single');
		expect(payload.proposalPpt?.scenarios).toHaveLength(1);
		expect(payload.proposalPpt?.scenarios[0]?.endingSkuId).toBe('bp_cb');
	});

	it('preserves proposal-assets bundle payload in token', () => {
		const service = new DlTokenService();
		const token = service.createToken({
			...baseInput,
			scope: 'proposal-assets-bundle',
			customerId: 'cust-1',
			proposalAssetsBundle: {
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
						expiringArr: 6000,
					},
				],
			},
		});

		const payload = service.verifyTokenForScope({
			token,
			scope: 'proposal-assets-bundle',
			customerId: 'cust-1',
		});

		expect(payload.proposalAssetsBundle).toBeDefined();
		expect(payload.proposalAssetsBundle?.journey).toBe('renewal');
		expect(payload.proposalAssetsBundle?.scenarios).toHaveLength(1);
	});

	it('rejects tampered signatures', () => {
		const service = new DlTokenService();
		const token = service.createToken({
			...baseInput,
			scope: 'customer-list',
			resellerId: 'reseller-a',
		});

		const tampered = `${token}tampered`;

		expect(() =>
			service.verifyTokenForScope({
				token: tampered,
				scope: 'customer-list',
				resellerId: 'reseller-a',
			}),
		).toThrow(UnauthorizedException);
	});

	it('rejects expired tokens with 410 semantics', () => {
		const service = new DlTokenService();
		const now = new Date('2026-02-22T00:00:00.000Z').getTime();

		vi.spyOn(Date, 'now').mockReturnValue(now);
		const token = service.createToken({
			...baseInput,
			scope: 'opportunities',
			customerId: 'customer-1',
			ttlSeconds: 1,
		});

		vi.spyOn(Date, 'now').mockReturnValue(now + 3_000);

		expect(() =>
			service.verifyTokenForScope({
				token,
				scope: 'opportunities',
				customerId: 'customer-1',
			}),
		).toThrow(GoneException);
	});

	it('reads expired historical tokens without rejecting them', () => {
		const service = new DlTokenService();
		const now = new Date('2026-02-22T00:00:00.000Z').getTime();

		vi.spyOn(Date, 'now').mockReturnValue(now);
		const token = service.createToken({
			...baseInput,
			scope: 'customer-list',
			resellerId: 'reseller-a',
			ttlSeconds: 1,
		});

		vi.spyOn(Date, 'now').mockReturnValue(now + 3_000);

		const payload = service.readHistoricalTokenPayload(token);
		expect(payload.scope).toBe('customer-list');
		expect(payload.resellerId).toBe('reseller-a');
	});

	it('allows repeated use of reusable tokens without hitting redemption storage', async () => {
		const service = new DlTokenService();
		const findFirst = vi.fn();
		const insert = vi.fn();

		(service as any).db = {
			query: {
				downloadTokenRedemptions: {
					findFirst,
				},
			},
			insert,
		};

		const token = service.createToken({
			...baseInput,
			scope: 'opportunities',
			customerId: 'customer-1',
		});

		await expect(service.assertTokenAvailable(token)).resolves.toMatchObject({
			scope: 'opportunities',
			customerId: 'customer-1',
		});
		await expect(service.assertTokenAvailable(token)).resolves.toMatchObject({
			scope: 'opportunities',
			customerId: 'customer-1',
		});
		await expect(service.consumeToken({ token })).resolves.toMatchObject({
			scope: 'opportunities',
			customerId: 'customer-1',
		});
		await expect(service.consumeToken({ token })).resolves.toMatchObject({
			scope: 'opportunities',
			customerId: 'customer-1',
		});

		expect(findFirst).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
	});

	it('rejects scope/binding mismatch', () => {
		const service = new DlTokenService();
		const token = service.createToken({
			...baseInput,
			scope: 'customer-list',
			resellerId: 'reseller-a',
		});

		expect(() =>
			service.verifyTokenForScope({
				token,
				scope: 'opportunities',
				customerId: 'customer-1',
			}),
		).toThrow(UnauthorizedException);

		expect(() =>
			service.verifyTokenForScope({
				token,
				scope: 'customer-list',
				resellerId: 'reseller-b',
			}),
		).toThrow(UnauthorizedException);
	});
});
