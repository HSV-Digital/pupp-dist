import { describe, expect, it } from 'vitest';
import { SkuCategory } from '@repo/types';
import type { RenewalSubscription } from '@repo/types';
import { groupByCustomer, groupByReseller } from './customer-utils';

function makeSubscription(
	overrides: Partial<RenewalSubscription> = {},
): RenewalSubscription {
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
		currentProduct: 'Microsoft 365 Business Premium',
		skuCategory: SkuCategory.Premium,
		seatCount: 10,
		annualRevenueRunRate: 1200,
		renewalDate: '2026-06-10',
		termMonths: 12,
		autoRenew: true,
		multiYear: false,
		hasCopilot: false,
		hasPurview: false,
		hasSureStep: false,
		currentMargin: 12,
		customerSegment: 'SMB',
		region: 'US',
		notes: '',
		...overrides,
	};
}

describe('groupByCustomer', () => {
	it('groups subscriptions by customerId', () => {
		const grouped = groupByCustomer([
			makeSubscription({ customerId: 'cust-1', subscriptionId: 'sub-1' }),
			makeSubscription({ customerId: 'cust-1', subscriptionId: 'sub-2' }),
			makeSubscription({ customerId: 'cust-2', subscriptionId: 'sub-3' }),
		]);

		expect(grouped).toHaveLength(2);
		expect(
			grouped.find((customer) => customer.customerId === 'cust-1')
				?.subscriptions,
		).toHaveLength(2);
	});

	it('aggregates total seats and total ARR', () => {
		const grouped = groupByCustomer([
			makeSubscription({
				customerId: 'cust-1',
				seatCount: 20,
				annualRevenueRunRate: 2000,
			}),
			makeSubscription({
				customerId: 'cust-1',
				seatCount: 5,
				annualRevenueRunRate: 400,
			}),
		]);

		expect(grouped[0].totalSeats).toBe(25);
		expect(grouped[0].totalARR).toBe(2400);
	});

	it('prefers nearest upcoming renewal date when future dates exist', () => {
		const grouped = groupByCustomer([
			makeSubscription({
				renewalDate: '2020-01-01',
			}),
			makeSubscription({
				subscriptionId: 'sub-2',
				renewalDate: '2099-01-15',
			}),
			makeSubscription({
				subscriptionId: 'sub-3',
				renewalDate: '2099-03-10',
			}),
		]);

		expect(grouped[0].renewalDate).toBe('2099-01-15');
	});

	it('uses latest past renewal date when there are no future dates', () => {
		const grouped = groupByCustomer([
			makeSubscription({ renewalDate: '2020-01-01' }),
			makeSubscription({ subscriptionId: 'sub-2', renewalDate: '2024-02-03' }),
			makeSubscription({ subscriptionId: 'sub-3', renewalDate: '2022-08-10' }),
		]);

		expect(grouped[0].renewalDate).toBe('2024-02-03');
	});

	it('falls back to original renewal date when all dates are invalid', () => {
		const grouped = groupByCustomer([
			makeSubscription({
				renewalDate: 'not-a-date',
			}),
			makeSubscription({
				subscriptionId: 'sub-2',
				renewalDate: '',
			}),
		]);

		expect(grouped[0].renewalDate).toBe('not-a-date');
	});

	it('sorts customers by total ARR descending', () => {
		const grouped = groupByCustomer([
			makeSubscription({
				customerId: 'low',
				annualRevenueRunRate: 100,
			}),
			makeSubscription({
				customerId: 'high',
				annualRevenueRunRate: 1000,
			}),
		]);

		expect(grouped[0].customerId).toBe('high');
		expect(grouped[1].customerId).toBe('low');
	});

	it('keeps first customer metadata for inconsistent records', () => {
		const grouped = groupByCustomer([
			makeSubscription({
				customerId: 'cust-1',
				customerName: 'Original Name',
				resellerName: 'Reseller A',
			}),
			makeSubscription({
				customerId: 'cust-1',
				subscriptionId: 'sub-2',
				customerName: 'Changed Name',
				resellerName: 'Reseller B',
			}),
		]);

		expect(grouped[0].customerName).toBe('Original Name');
		expect(grouped[0].resellerName).toBe('Reseller A');
	});

	it('returns empty array for empty input', () => {
		expect(groupByCustomer([])).toEqual([]);
	});

	it('supports zero-seat subscriptions without dropping customer', () => {
		const grouped = groupByCustomer([
			makeSubscription({
				seatCount: 0,
				annualRevenueRunRate: 0,
			}),
		]);

		expect(grouped).toHaveLength(1);
		expect(grouped[0].totalSeats).toBe(0);
		expect(grouped[0].totalARR).toBe(0);
	});

	it('retains customers that only have unsupported SKUs', () => {
		const grouped = groupByCustomer([
			makeSubscription({
				customerId: 'cust-e3',
				subscriptionId: 'sub-e3',
				currentProduct: 'Microsoft 365 E3',
				skuCategory: SkuCategory.E3,
			}),
			makeSubscription({
				customerId: 'cust-e5',
				subscriptionId: 'sub-e5',
				currentProduct: 'Microsoft 365 E5',
				skuCategory: SkuCategory.E5,
			}),
		]);

		expect(grouped.map((customer) => customer.customerId)).toEqual([
			'cust-e3',
			'cust-e5',
		]);
	});

	it('handles mixed valid and invalid renewal dates', () => {
		const grouped = groupByCustomer([
			makeSubscription({ renewalDate: 'invalid-date' }),
			makeSubscription({ subscriptionId: 'sub-2', renewalDate: '2099-07-01' }),
		]);

		expect(grouped[0].renewalDate).toBe('2099-07-01');
	});
});

describe('groupByReseller', () => {
	it('groups subscriptions by resellerName', () => {
		const grouped = groupByReseller([
			makeSubscription({ resellerName: 'Reseller A', subscriptionId: 'sub-1' }),
			makeSubscription({ resellerName: 'Reseller A', subscriptionId: 'sub-2' }),
			makeSubscription({ resellerName: 'Reseller B', subscriptionId: 'sub-3' }),
		]);

		expect(grouped).toHaveLength(2);
		const resellerA = grouped.find((r) => r.resellerName === 'Reseller A');
		expect(resellerA?.subscriptions).toHaveLength(2);
	});

	it('aggregates totalSeats and totalARR across all subscriptions', () => {
		const grouped = groupByReseller([
			makeSubscription({
				resellerName: 'Reseller A',
				seatCount: 50,
				annualRevenueRunRate: 5000,
			}),
			makeSubscription({
				resellerName: 'Reseller A',
				subscriptionId: 'sub-2',
				seatCount: 30,
				annualRevenueRunRate: 3000,
			}),
		]);

		expect(grouped[0].totalSeats).toBe(80);
		expect(grouped[0].totalARR).toBe(8000);
	});

	it('nests customers via groupByCustomer', () => {
		const grouped = groupByReseller([
			makeSubscription({
				resellerName: 'Reseller A',
				customerId: 'cust-1',
				subscriptionId: 'sub-1',
			}),
			makeSubscription({
				resellerName: 'Reseller A',
				customerId: 'cust-2',
				subscriptionId: 'sub-2',
			}),
		]);

		expect(grouped[0].customerCount).toBe(2);
		expect(grouped[0].customers).toHaveLength(2);
	});

	it('sorts resellers by totalARR descending', () => {
		const grouped = groupByReseller([
			makeSubscription({
				resellerName: 'Low',
				annualRevenueRunRate: 100,
			}),
			makeSubscription({
				resellerName: 'High',
				subscriptionId: 'sub-2',
				annualRevenueRunRate: 9000,
			}),
		]);

		expect(grouped[0].resellerName).toBe('High');
		expect(grouped[1].resellerName).toBe('Low');
	});

	it('returns empty array for empty input', () => {
		expect(groupByReseller([])).toEqual([]);
	});
});
