import { describe, expect, it } from 'vitest';
import { SkuCategory } from '@repo/types';
import type { RenewalSubscription } from '@repo/types';
import {
	buildCustomerOpportunities,
	buildOpportunityId,
	toOpportunityDescriptorMap,
} from './opportunity-utils';

function makeSubscription(
	overrides: Partial<RenewalSubscription> = {},
): RenewalSubscription {
	return {
		customerId: 'cust-1',
		subscriptionId: 'sub-1',
		customerName: 'Contoso',
		resellerName: 'Reseller A',
		distributorName: 'Dist A',
		pssAIWorkforceName: 'PSS Alpha',
		pssAISecurityName: '',
		psaName: '',
		pdmName: 'PDM Alpha',
		pmmName: 'PMM Alpha',
		currentProduct: 'Microsoft 365 Business Basic',
		skuCategory: SkuCategory.Basic,
		seatCount: 100,
		annualRevenueRunRate: 50000,
		renewalDate: '2026-06-15',
		termMonths: 12,
		autoRenew: true,
		multiYear: false,
		hasCopilot: false,
		hasPurview: false,
		hasSureStep: false,
		currentMargin: 10,
		customerSegment: '',
		region: '',
		notes: '',
		...overrides,
	};
}

describe('buildOpportunityId', () => {
	it('uses base id when subscription id is unique', () => {
		expect(
			buildOpportunityId('cust-1', 'sub-1', {
				ordinal: 1,
				total: 1,
			}),
		).toBe('cust-1:sub-1');
	});

	it('adds stable ordinal suffix for duplicate subscription ids', () => {
		expect(
			buildOpportunityId('cust-1', 'sub-1', {
				ordinal: 2,
				total: 3,
			}),
		).toBe('cust-1:sub-1:2');
	});
});

describe('buildCustomerOpportunities', () => {
	it('builds opportunities only for supported starting skus', () => {
		const opportunities = buildCustomerOpportunities([
			makeSubscription({
				subscriptionId: 'supported',
				currentProduct: 'Microsoft 365 Business Premium',
			}),
			makeSubscription({
				subscriptionId: 'unsupported',
				currentProduct: 'Microsoft 365 E3',
			}),
		]);

		expect(opportunities).toHaveLength(1);
		expect(opportunities[0].subscriptionId).toBe('supported');
		expect(opportunities[0].endingSkus.length).toBeGreaterThan(0);
	});

	it('creates deterministic ids for duplicate subscription ids', () => {
		const opportunities = buildCustomerOpportunities([
			makeSubscription({
				subscriptionId: 'dup-sub',
				renewalDate: '2026-08-01',
			}),
			makeSubscription({
				subscriptionId: 'dup-sub',
				renewalDate: '2026-07-01',
			}),
		]);

		expect(
			opportunities.map((opportunity) => opportunity.opportunityId),
		).toEqual(['cust-1:dup-sub:2', 'cust-1:dup-sub:1']);
	});

	it('builds descriptor map for scenario-selection state', () => {
		const opportunities = buildCustomerOpportunities([
			makeSubscription({
				subscriptionId: 'sub-a',
				currentProduct: 'Microsoft 365 Business Standard',
				seatCount: 40,
			}),
		]);

		const descriptors = toOpportunityDescriptorMap(opportunities);
		const descriptor = descriptors.get('cust-1:sub-a');

		expect(descriptor).toBeDefined();
		expect(descriptor?.startingSkuId).toBe('bs');
		expect(descriptor?.maxSeats).toBe(40);
		expect(descriptor?.allowedEndingSkuIds.length).toBeGreaterThan(0);
	});

	it('converts USD ARR to regional ARR for proposal calculations', () => {
		const [opportunityCa] = buildCustomerOpportunities([
			makeSubscription({
				subscriptionId: 'sub-ca',
				region: 'Canada',
				annualRevenueRunRate: 50_000,
			}),
		]);
		const [opportunityBr] = buildCustomerOpportunities([
			makeSubscription({
				subscriptionId: 'sub-br',
				region: 'Brazil',
				annualRevenueRunRate: 50_000,
			}),
		]);

		expect(opportunityCa.proposalExpiringArr).toBe(67_800);
		expect(opportunityBr.proposalExpiringArr).toBe(286_250);
	});
});
