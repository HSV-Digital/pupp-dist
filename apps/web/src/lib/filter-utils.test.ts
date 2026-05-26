import { describe, expect, it } from 'vitest';
import type { FilterState, RenewalSubscription } from '@repo/types';
import { SkuCategory } from '@repo/types';
import { daysUntilRenewal, getAvailableOptions } from './filter-utils';

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
		currentProduct: 'Microsoft 365 E3',
		skuCategory: SkuCategory.E3,
		seatCount: 100,
		annualRevenueRunRate: 50000,
		renewalDate: '2025-06-15',
		termMonths: 12,
		autoRenew: true,
		multiYear: false,
		hasCopilot: false,
		hasPurview: false,
		hasSureStep: false,
		currentMargin: 15,
		customerSegment: 'Enterprise',
		region: 'US',
		notes: '',
		...overrides,
	};
}

const EMPTY_FILTERS: FilterState = {
	pssAIWorkforce: [],
	pssAISecurity: [],
	psa: [],
	distributor: [],
	reseller: [],
	customer: [],
	pdm: [],
	pmm: [],
	region: [],
	type: [],
	skuCategory: [],
	expSeats: [],
	renewalDate: [],
	pastRenewalDate: [],
};

const data: RenewalSubscription[] = [
	makeSubscription({
		subscriptionId: '1',
		customerName: 'Contoso',
		resellerName: 'Reseller A',
		distributorName: 'Dist A',
		pssAIWorkforceName: 'PSS Alpha',
		pdmName: 'PDM Alpha',
		pmmName: 'PMM Alpha',
		currentProduct: 'Microsoft 365 Business Basic',
		skuCategory: SkuCategory.Basic,
	}),
	makeSubscription({
		subscriptionId: '2',
		customerName: 'Fabrikam',
		resellerName: 'Reseller B',
		distributorName: 'Dist A',
		pssAIWorkforceName: 'PSS Beta',
		pdmName: 'PDM Beta',
		pmmName: 'PMM Alpha',
		currentProduct: 'Microsoft 365 Business Standard',
		skuCategory: SkuCategory.Standard,
	}),
	makeSubscription({
		subscriptionId: '3',
		customerName: 'Northwind',
		resellerName: 'Reseller A',
		distributorName: 'Dist B',
		pssAIWorkforceName: 'PSS Alpha',
		pdmName: 'PDM Alpha',
		pmmName: 'PMM Beta',
		currentProduct: 'Microsoft 365 Business Premium',
		skuCategory: SkuCategory.Premium,
	}),
];

describe('getAvailableOptions', () => {
	it('returns all unique values when no filters are applied', () => {
		const options = getAvailableOptions(data, EMPTY_FILTERS);
		expect(options.pssAIWorkforce).toEqual(['PSS Alpha', 'PSS Beta']);
		expect(options.distributor).toEqual(['Dist A', 'Dist B']);
		expect(options.reseller).toEqual(['Reseller A', 'Reseller B']);
		expect(options.customer).toEqual(['Contoso', 'Fabrikam', 'Northwind']);
		expect(options.pdm).toEqual(['PDM Alpha', 'PDM Beta']);
		expect(options.pmm).toEqual(['PMM Alpha', 'PMM Beta']);
		expect(options.skuCategory).toEqual([
			'Business Basic',
			'Business Standard',
			'Business Premium',
		]);
	});

	it('cross-filters: filtering PSS narrows distributor/reseller/customer options', () => {
		const filters = { ...EMPTY_FILTERS, pssAIWorkforce: ['PSS Beta'] };
		const options = getAvailableOptions(data, filters);
		// PSS Beta → only sub 2 (Fabrikam, Reseller B, Dist A)
		expect(options.distributor).toEqual(['Dist A']);
		expect(options.reseller).toEqual(['Reseller B']);
		expect(options.customer).toEqual(['Fabrikam']);
	});

	it('self-excludes: filtered dimension still shows all its own values', () => {
		const filters = { ...EMPTY_FILTERS, pssAIWorkforce: ['PSS Beta'] };
		const options = getAvailableOptions(data, filters);
		// PSS should still show both options (self-exclusion)
		expect(options.pssAIWorkforce).toEqual(['PSS Alpha', 'PSS Beta']);
	});

	it('applies multiple cross-filters', () => {
		const filters = {
			...EMPTY_FILTERS,
			pssAIWorkforce: ['PSS Alpha'],
			distributor: ['Dist B'],
		};
		const options = getAvailableOptions(data, filters);
		// PSS Alpha + Dist B → only sub 3 (Northwind)
		expect(options.customer).toEqual(['Northwind']);
		expect(options.reseller).toEqual(['Reseller A']);
		// PSS self-excludes: with Dist B only, both PSS values exist? No—Dist B only has PSS Alpha
		expect(options.pssAIWorkforce).toEqual(['PSS Alpha']);
		// Distributor self-excludes: with PSS Alpha only, Dist A + Dist B exist
		expect(options.distributor).toEqual(['Dist A', 'Dist B']);
	});

	it('returns empty arrays for empty data', () => {
		const options = getAvailableOptions([], EMPTY_FILTERS);
		expect(options.pssAIWorkforce).toEqual([]);
		expect(options.distributor).toEqual([]);
		expect(options.reseller).toEqual([]);
		expect(options.customer).toEqual([]);
		expect(options.pdm).toEqual([]);
		expect(options.pmm).toEqual([]);
		expect(options.skuCategory).toEqual([]);
		expect(options.expSeats).toEqual([]);
		expect(options.renewalDate).toEqual([]);
	});

	it('deduplicates values', () => {
		const dupeData = [
			makeSubscription({
				pssAIWorkforceName: 'PSS Alpha',
				distributorName: 'Dist A',
			}),
			makeSubscription({
				pssAIWorkforceName: 'PSS Alpha',
				distributorName: 'Dist A',
			}),
		];
		const options = getAvailableOptions(dupeData, EMPTY_FILTERS);
		expect(options.pssAIWorkforce).toEqual(['PSS Alpha']);
		expect(options.distributor).toEqual(['Dist A']);
	});

	it('sorts values alphabetically', () => {
		const unsortedData = [
			makeSubscription({ customerName: 'Zebra Corp' }),
			makeSubscription({ customerName: 'Alpha Inc' }),
			makeSubscription({ customerName: 'Middle Co' }),
		];
		const options = getAvailableOptions(unsortedData, EMPTY_FILTERS);
		expect(options.customer).toEqual(['Alpha Inc', 'Middle Co', 'Zebra Corp']);
	});

	it('handles filtering by distributor', () => {
		const filters = { ...EMPTY_FILTERS, distributor: ['Dist A'] };
		const options = getAvailableOptions(data, filters);
		// Dist A → subs 1 and 2
		expect(options.pssAIWorkforce).toEqual(['PSS Alpha', 'PSS Beta']);
		expect(options.customer).toEqual(['Contoso', 'Fabrikam']);
		expect(options.reseller).toEqual(['Reseller A', 'Reseller B']);
	});

	it('cross-filters PDM narrows other options', () => {
		const filters = { ...EMPTY_FILTERS, pdm: ['PDM Beta'] };
		const options = getAvailableOptions(data, filters);
		// PDM Beta → only sub 2 (Fabrikam)
		expect(options.customer).toEqual(['Fabrikam']);
		expect(options.pssAIWorkforce).toEqual(['PSS Beta']);
	});

	it('cross-filters PMM narrows other options', () => {
		const filters = { ...EMPTY_FILTERS, pmm: ['PMM Beta'] };
		const options = getAvailableOptions(data, filters);
		// PMM Beta → only sub 3 (Northwind)
		expect(options.customer).toEqual(['Northwind']);
		expect(options.pdm).toEqual(['PDM Alpha']);
	});

	it('smart filter cross-filters with dropdown filters', () => {
		const smartData = [
			makeSubscription({
				subscriptionId: 's1',
				pssAIWorkforceName: 'PSS A',
				seatCount: 30,
			}),
			makeSubscription({
				subscriptionId: 's2',
				pssAIWorkforceName: 'PSS B',
				seatCount: 200,
			}),
		];
		const filters = { ...EMPTY_FILTERS, expSeats: ['25-49'] };
		const options = getAvailableOptions(smartData, filters);
		// 25-49 seats → only s1 (PSS A)
		expect(options.pssAIWorkforce).toEqual(['PSS A']);
	});

	it('smart filter shows available buckets with cross-filtering', () => {
		const smartData = [
			makeSubscription({
				subscriptionId: 's1',
				pssAIWorkforceName: 'PSS A',
				seatCount: 30,
				annualRevenueRunRate: 50000,
			}),
			makeSubscription({
				subscriptionId: 's2',
				pssAIWorkforceName: 'PSS B',
				seatCount: 200,
				annualRevenueRunRate: 300000,
			}),
		];
		// Filter to PSS A only — which has 30 seats
		const filters = { ...EMPTY_FILTERS, pssAIWorkforce: ['PSS A'] };
		const options = getAvailableOptions(smartData, filters);
		expect(options.expSeats).toContain('25-49');
		expect(options.expSeats).not.toContain('100-299');
	});

	it('smart sku filter cross-filters and self-excludes correctly', () => {
		const filters = { ...EMPTY_FILTERS, reseller: ['Reseller A'] };
		const options = getAvailableOptions(data, filters);
		expect(options.skuCategory).toEqual(['Business Basic', 'Business Premium']);

		const selfFiltered = getAvailableOptions(data, {
			...EMPTY_FILTERS,
			skuCategory: ['Business Basic'],
		});
		expect(selfFiltered.skuCategory).toEqual([
			'Business Basic',
			'Business Standard',
			'Business Premium',
		]);
	});
});

describe('daysUntilRenewal', () => {
	it('returns positive days for future dates', () => {
		const today = new Date('2026-03-01');
		expect(daysUntilRenewal('2026-03-08', today)).toBe(7);
	});

	it('returns 0 for same day', () => {
		const today = new Date('2026-03-01');
		expect(daysUntilRenewal('2026-03-01', today)).toBe(0);
	});

	it('returns negative days for past dates', () => {
		const today = new Date('2026-03-10');
		expect(daysUntilRenewal('2026-03-01', today)).toBe(-9);
	});

	it('returns correct value for 60-day window', () => {
		const today = new Date('2026-03-01');
		expect(daysUntilRenewal('2026-04-30', today)).toBe(60);
	});
});
