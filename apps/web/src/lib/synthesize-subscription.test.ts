import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SkuCategory } from '@repo/types';
import type { ResellerFormData } from './reseller-session';
import { synthesizeSubscription } from './synthesize-subscription';

const BASE: ResellerFormData = {
	customerId: 'uuid-1234',
	partnerName: 'Contoso Partners',
	customerName: 'Northwind Traders',
	currentSku: 'Business Standard',
	numberOfSeats: 500,
	costPerUser: 12.5,
	region: 'United States',
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-01-15T00:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('synthesizeSubscription', () => {
	it('maps customerId from form data', () => {
		const sub = synthesizeSubscription(BASE);
		expect(sub.customerId).toBe('uuid-1234');
	});

	it('sets subscriptionId with local- prefix', () => {
		const sub = synthesizeSubscription(BASE);
		expect(sub.subscriptionId).toBe('local-uuid-1234');
	});

	it('maps customerName and resellerName', () => {
		const sub = synthesizeSubscription(BASE);
		expect(sub.customerName).toBe('Northwind Traders');
		expect(sub.resellerName).toBe('Contoso Partners');
	});

	it('maps currentProduct from currentSku', () => {
		const sub = synthesizeSubscription(BASE);
		expect(sub.currentProduct).toBe('Business Standard');
	});

	it('computes ARR as seats * costPerUser * 12', () => {
		const sub = synthesizeSubscription(BASE);
		expect(sub.annualRevenueRunRate).toBe(500 * 12.5 * 12);
	});

	it('derives skuCategory for Business Basic', () => {
		const sub = synthesizeSubscription({
			...BASE,
			currentSku: 'Business Basic',
		});
		expect(sub.skuCategory).toBe(SkuCategory.Basic);
	});

	it('derives skuCategory for Business Standard', () => {
		const sub = synthesizeSubscription({
			...BASE,
			currentSku: 'Business Standard',
		});
		expect(sub.skuCategory).toBe(SkuCategory.Standard);
	});

	it('derives skuCategory for Business Premium', () => {
		const sub = synthesizeSubscription({
			...BASE,
			currentSku: 'Business Premium',
		});
		expect(sub.skuCategory).toBe(SkuCategory.Premium);
	});

	it('falls back to Other for unknown SKU', () => {
		const sub = synthesizeSubscription({ ...BASE, currentSku: 'Unknown Plan' });
		expect(sub.skuCategory).toBe(SkuCategory.Other);
	});

	it('sets renewalDate to 90 days from today', () => {
		const sub = synthesizeSubscription(BASE);
		const expected = new Date('2026-04-15T00:00:00Z');
		expect(new Date(sub.renewalDate).toISOString()).toBe(
			expected.toISOString(),
		);
	});

	it('sets termMonths to 12', () => {
		const sub = synthesizeSubscription(BASE);
		expect(sub.termMonths).toBe(12);
	});

	it('defaults boolean flags to false', () => {
		const sub = synthesizeSubscription(BASE);
		expect(sub.autoRenew).toBe(false);
		expect(sub.multiYear).toBe(false);
		expect(sub.hasCopilot).toBe(false);
		expect(sub.hasPurview).toBe(false);
		expect(sub.hasSureStep).toBe(false);
	});

	it('defaults currentMargin to 20 and string fields to empty', () => {
		const sub = synthesizeSubscription(BASE);
		expect(sub.currentMargin).toBe(20);
		expect(sub.distributorName).toBe('');
		expect(sub.customerSegment).toBe('');
		expect(sub.region).toBe('United States');
		expect(sub.notes).toBe('');
	});
});
