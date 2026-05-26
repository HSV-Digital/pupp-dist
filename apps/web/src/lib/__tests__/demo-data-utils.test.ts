import { describe, it, expect } from 'vitest';
import { SkuCategory } from '@repo/types';
import type { RenewalSubscription, FilterState } from '@repo/types';
import {
	buildDemoCustomerRows,
	buildDemoResellerRows,
	buildDemoSummary,
	filterSubscriptions,
	sortRows,
	paginateRows,
	searchFilterOptions,
} from '../demo-data-utils';

function makeSub(
	overrides: Partial<RenewalSubscription> = {},
): RenewalSubscription {
	return {
		customerId: 'c1',
		subscriptionId: 'sub1',
		customerName: 'Contoso',
		resellerName: 'CDW',
		distributorName: 'Ingram Micro',
		pssAIWorkforceName: 'Sarah',
		pssAISecurityName: 'Mike',
		psaName: 'Robert',
		pdmName: 'Chris',
		pmmName: 'Nicole',
		currentProduct: 'Microsoft 365 Business Standard',
		type: 'Renewal',
		skuCategory: SkuCategory.Standard,
		seatCount: 100,
		annualRevenueRunRate: 15000,
		renewalDate: new Date(Date.now() + 30 * 86400000).toISOString(),
		termMonths: 12,
		autoRenew: false,
		multiYear: false,
		hasCopilot: false,
		hasPurview: false,
		hasSureStep: false,
		currentMargin: 20,
		customerSegment: 'SMB',
		region: 'United States',
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

describe('buildDemoCustomerRows', () => {
	it('groups subscriptions by customerId', () => {
		const subs = [
			makeSub({ customerId: 'c1', seatCount: 50, annualRevenueRunRate: 5000 }),
			makeSub({
				customerId: 'c1',
				subscriptionId: 'sub2',
				seatCount: 100,
				annualRevenueRunRate: 10000,
				skuCategory: SkuCategory.Premium,
			}),
			makeSub({
				customerId: 'c2',
				customerName: 'Fabrikam',
				seatCount: 200,
				annualRevenueRunRate: 20000,
			}),
		];
		const rows = buildDemoCustomerRows(subs);
		expect(rows).toHaveLength(2);

		const c1 = rows.find((r) => r.customerId === 'c1')!;
		expect(c1.totalSeatsRange).toBe('100-299');
		expect(c1).not.toHaveProperty('totalARR');
		expect(c1.subscriptionCount).toBe(2);
		expect(c1.subscriptionSkuCategories).toContain(SkuCategory.Standard);
		expect(c1.subscriptionSkuCategories).toContain(SkuCategory.Premium);
	});

	it('picks earliest renewal date', () => {
		const early = new Date(Date.now() + 10 * 86400000).toISOString();
		const late = new Date(Date.now() + 60 * 86400000).toISOString();
		const subs = [
			makeSub({ customerId: 'c1', renewalDate: late }),
			makeSub({ customerId: 'c1', subscriptionId: 'sub2', renewalDate: early }),
		];
		const rows = buildDemoCustomerRows(subs);
		expect(rows[0]!.renewalDate).toBe(early);
	});
});

describe('buildDemoResellerRows', () => {
	it('groups by reseller and counts unique customers', () => {
		const subs = [
			makeSub({ customerId: 'c1', resellerName: 'CDW' }),
			makeSub({
				customerId: 'c2',
				resellerName: 'CDW',
				customerName: 'Fabrikam',
				subscriptionId: 'sub2',
			}),
			makeSub({
				customerId: 'c3',
				resellerName: 'SHI',
				customerName: 'Northwind',
				subscriptionId: 'sub3',
			}),
		];
		const rows = buildDemoResellerRows(subs);
		expect(rows).toHaveLength(2);

		const cdw = rows.find((r) => r.resellerName === 'CDW')!;
		expect(cdw.customerCount).toBe(2);
		expect(cdw.subscriptionCount).toBe(2);
	});
});

describe('buildDemoSummary', () => {
	it('computes totals', () => {
		const subs = [
			makeSub({
				seatCount: 100,
				annualRevenueRunRate: 10000,
				hasCopilot: true,
			}),
			makeSub({
				customerId: 'c2',
				seatCount: 200,
				annualRevenueRunRate: 20000,
				hasCopilot: false,
				subscriptionId: 'sub2',
			}),
		];
		const summary = buildDemoSummary(subs);
		expect(summary.totalRenewals).toBe(2);
		expect(summary.totalSeats).toBe(300);
		expect(summary.totalSeatsDisplay).toBe('300');
		expect(summary.totalCustomers).toBe(2);
		expect(summary.copilotOpportunities).toBe(1);
	});
});

describe('filterSubscriptions', () => {
	const subs = [
		makeSub({
			customerId: 'c1',
			customerName: 'Contoso',
			region: 'United States',
		}),
		makeSub({
			customerId: 'c2',
			customerName: 'Fabrikam',
			region: 'Canada',
			subscriptionId: 'sub2',
			resellerName: 'SHI',
		}),
		makeSub({
			customerId: 'c3',
			customerName: 'Northwind',
			region: 'Brazil',
			subscriptionId: 'sub3',
		}),
	];

	it('filters by search term', () => {
		const result = filterSubscriptions(subs, EMPTY_FILTERS, 'fabrikam');
		expect(result).toHaveLength(1);
		expect(result[0]!.customerName).toBe('Fabrikam');
	});

	it('filters by region', () => {
		const filters = { ...EMPTY_FILTERS, region: ['Canada'] };
		const result = filterSubscriptions(subs, filters, '');
		expect(result).toHaveLength(1);
		expect(result[0]!.region).toBe('Canada');
	});

	it('filters by reseller', () => {
		const filters = { ...EMPTY_FILTERS, reseller: ['SHI'] };
		const result = filterSubscriptions(subs, filters, '');
		expect(result).toHaveLength(1);
	});

	it('filters by sku category with OR semantics', () => {
		const skuSubs = [
			makeSub({
				customerId: 'c1',
				subscriptionId: 'sub1',
				currentProduct: 'Microsoft 365 Business Basic',
				skuCategory: SkuCategory.Basic,
			}),
			makeSub({
				customerId: 'c2',
				subscriptionId: 'sub2',
				currentProduct: 'Microsoft 365 Business Standard',
				skuCategory: SkuCategory.Standard,
			}),
			makeSub({
				customerId: 'c3',
				subscriptionId: 'sub3',
				currentProduct: 'Microsoft 365 Business Premium',
				skuCategory: SkuCategory.Premium,
			}),
		];
		const filters = {
			...EMPTY_FILTERS,
			skuCategory: ['Business Basic', 'Business Premium'],
		};
		const result = filterSubscriptions(skuSubs, filters, '');
		expect(result).toHaveLength(2);
		expect(result.map((sub) => sub.skuCategory)).toEqual([
			SkuCategory.Basic,
			SkuCategory.Premium,
		]);
	});

	it('combines search and filters', () => {
		const filters = { ...EMPTY_FILTERS, region: ['United States'] };
		const result = filterSubscriptions(subs, filters, 'contoso');
		expect(result).toHaveLength(1);
	});
});

describe('sortRows', () => {
	const rows = [
		{ name: 'Bravo', value: 20 },
		{ name: 'Alpha', value: 30 },
		{ name: 'Charlie', value: 10 },
	];

	it('sorts strings ascending', () => {
		const sorted = sortRows(rows, 'name', 'ascending');
		expect(sorted.map((r) => r.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
	});

	it('sorts numbers descending', () => {
		const sorted = sortRows(rows, 'value', 'descending');
		expect(sorted.map((r) => r.value)).toEqual([30, 20, 10]);
	});
});

describe('paginateRows', () => {
	const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));

	it('returns correct page', () => {
		const page1 = paginateRows(items, 1, 10);
		expect(page1).toHaveLength(10);
		expect(page1[0]!.id).toBe(1);

		const page3 = paginateRows(items, 3, 10);
		expect(page3).toHaveLength(5);
		expect(page3[0]!.id).toBe(21);
	});

	it('returns empty for out-of-range page', () => {
		const result = paginateRows(items, 10, 10);
		expect(result).toHaveLength(0);
	});
});

describe('searchFilterOptions', () => {
	const subs = [
		makeSub({ customerName: 'Contoso Ltd' }),
		makeSub({
			customerId: 'c2',
			customerName: 'Contoso Group',
			subscriptionId: 'sub2',
		}),
		makeSub({
			customerId: 'c3',
			customerName: 'Fabrikam',
			subscriptionId: 'sub3',
		}),
	];

	it('searches case-insensitively', () => {
		const results = searchFilterOptions(subs, 'customer', 'conto');
		expect(results).toHaveLength(2);
		expect(results).toContain('Contoso Ltd');
		expect(results).toContain('Contoso Group');
	});

	it('returns empty for unknown dimension', () => {
		const results = searchFilterOptions(subs, 'unknown', 'test');
		expect(results).toHaveLength(0);
	});

	it('returns empty for empty query', () => {
		const results = searchFilterOptions(subs, 'customer', '');
		expect(results).toHaveLength(0);
	});
});
