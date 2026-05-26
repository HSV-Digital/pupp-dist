import { describe, expect, it } from 'vitest';
import type { EndingSku, StartingSku } from '@repo/types';
import { ENDING_SKU_BY_ID, INCENTIVE_RATES, STARTING_SKU_BY_ID } from '@/lib/upgrade-matrix';
import {
	calculateIncentives,
	calculateScenario,
	getValidUpgradePaths,
	matchStartingSku,
} from '@/lib/rules-engine';

function getStartingSku(id: string): StartingSku {
	const sku = STARTING_SKU_BY_ID.get(id);
	if (!sku) {
		throw new Error(`Unknown starting SKU: ${id}`);
	}
	return sku;
}

function getEndingSku(id: string): EndingSku {
	const sku = ENDING_SKU_BY_ID.get(id);
	if (!sku) {
		throw new Error(`Unknown ending SKU: ${id}`);
	}
	return sku;
}

function getExpectedListMonthlyPrice(endingId: string): number {
	const byEndingSkuId: Partial<Record<string, number>> = {
		bs_cb: 33.5,
		bp_cb: 43,
		bp_cb_purview: 53,
		bp_defender: 32,
		bp_purview: 32,
		bp_defender_purview: 37,
	};

	return byEndingSkuId[endingId] ?? getEndingSku(endingId).listPrice;
}

describe('getValidUpgradePaths', () => {
	it.each([
		[6, 'bb'],
		[6, 'bs'],
		[5, 'bp'],
	])('returns %i valid paths for %s', (expectedCount, startingId) => {
		const paths = getValidUpgradePaths(startingId);
		expect(paths).toHaveLength(expectedCount);
	});

	it('returns empty for unknown starting SKU', () => {
		expect(getValidUpgradePaths('unknown')).toEqual([]);
	});
});

describe('calculateScenario', () => {
	it.each([
		['bb', 'bs_cb', 100, 26400, 7200, 19200],
		['bb', 'bp_cb', 100, 38400, 7200, 31200],
		['bb', 'bp_cb_purview', 100, 44400, 7200, 37200],
		['bb', 'bp_defender', 100, 38400, 7200, 31200],
		['bb', 'bp_purview', 100, 38400, 7200, 31200],
		['bb', 'bp_defender_purview', 100, 44400, 7200, 37200],
		['bs', 'bs_cb', 100, 26400, 15000, 11400],
		['bs', 'bp_cb', 100, 38400, 15000, 23400],
		['bs', 'bp_cb_purview', 100, 44400, 15000, 29400],
		['bs', 'bp_defender', 100, 38400, 15000, 23400],
		['bs', 'bp_purview', 100, 38400, 15000, 23400],
		['bs', 'bp_defender_purview', 100, 44400, 15000, 29400],
		['bp', 'bp_cb', 100, 38400, 26400, 12000],
		['bp', 'bp_cb_purview', 100, 44400, 26400, 18000],
		['bp', 'bp_defender', 100, 38400, 26400, 12000],
		['bp', 'bp_purview', 100, 38400, 26400, 12000],
		['bp', 'bp_defender_purview', 100, 44400, 26400, 18000],
	])(
		'calculates %s -> %s at %i seats correctly',
		(
			startingId,
			endingId,
			seats,
			expectedNewAnnual,
			expectedCurrentAnnual,
			expectedIncremental,
		) => {
			const scenario = calculateScenario(
				getStartingSku(startingId),
				getEndingSku(endingId),
				seats,
			);
			const expectedListAnnual =
				getExpectedListMonthlyPrice(endingId) * seats * 12;
			const expectedPromoSavings = expectedListAnnual - expectedNewAnnual;

			expect(scenario.newAnnualValue).toBe(expectedNewAnnual);
			expect(scenario.offerAnnualValue).toBe(expectedNewAnnual);
			expect(scenario.listAnnualValue).toBe(expectedListAnnual);
			expect(scenario.promoSavingsAnnual).toBe(expectedPromoSavings);
			expect(scenario.currentAnnualValue).toBe(expectedCurrentAnnual);
			expect(scenario.incrementalCost).toBe(expectedIncremental);
			expect(scenario.seats).toBe(seats);
		},
	);

	it('normalizes invalid seat counts to 0', () => {
		const scenario = calculateScenario(
			getStartingSku('bb'),
			getEndingSku('bs_cb'),
			-10,
		);

		expect(scenario.seats).toBe(0);
		expect(scenario.newAnnualValue).toBe(0);
		expect(scenario.offerAnnualValue).toBe(0);
		expect(scenario.listAnnualValue).toBe(0);
		expect(scenario.promoSavingsAnnual).toBe(0);
		expect(scenario.currentAnnualValue).toBe(0);
		expect(scenario.incrementalCost).toBe(0);
	});

	it('returns zero promo savings when list and promo prices are equal', () => {
		const scenario = calculateScenario(
			getStartingSku('bb'),
			getEndingSku('bp_defender'),
			25,
		);

		expect(scenario.listAnnualValue).toBe(scenario.offerAnnualValue);
		expect(scenario.promoSavingsAnnual).toBe(0);
	});
});

describe('calculateIncentives', () => {
	it('Example 1: renewal bb -> bs_cb at 100 seats (US)', () => {
		// target_part  = 22 * (1 - 0.137) * 100 * 12 = 22,783.20
		// current_part =  6 * (1 - 0.20)  * 100 * 12 =  5,760.00
		// growth_base  = 17,023.20
		// bs_cb IS in the Strategic set; bb is NOT 'bp'.
		const economics = calculateIncentives({
			endingSkuId: 'bs_cb',
			targetPrice: 22,
			currentPrice: 6,
			seats: 100,
			journey: 'renewal',
			startingSkuId: 'bb',
		});
		// Target leg
		expect(economics.cspCore).toBeCloseTo(854.37, 2);
		expect(economics.strategicAccelerator).toBeCloseTo(683.5, 2);
		expect(economics.growthAccelerator).toBeCloseTo(1276.74, 2);
		expect(economics.totalIncentive).toBeCloseTo(2814.61, 2);
		// Current leg
		expect(economics.cspCoreCurrent).toBeCloseTo(216.0, 2);
		expect(economics.strategicAcceleratorCurrent).toBe(0);
		expect(economics.currentIncentive).toBeCloseTo(216.0, 2);
		expect(economics.incrementalIncentive).toBeCloseTo(2598.61, 2);
	});

	it('Example 2: renewal bs -> bp_cb at 100 seats (US)', () => {
		// target_part  = 32   * 0.849 * 100 * 12 = 32,601.60
		// current_part = 12.5 * 0.80  * 100 * 12 = 12,000.00
		// growth_base  = 20,601.60
		// bp_cb IS in the Strategic set; bs is NOT 'bp'.
		const economics = calculateIncentives({
			endingSkuId: 'bp_cb',
			targetPrice: 32,
			currentPrice: 12.5,
			seats: 100,
			journey: 'renewal',
			startingSkuId: 'bs',
		});
		expect(economics.cspCore).toBeCloseTo(1222.56, 2);
		expect(economics.strategicAccelerator).toBeCloseTo(978.05, 2);
		expect(economics.growthAccelerator).toBeCloseTo(1545.12, 2);
		expect(economics.totalIncentive).toBeCloseTo(3745.73, 2);
		expect(economics.cspCoreCurrent).toBeCloseTo(450.0, 2);
		expect(economics.strategicAcceleratorCurrent).toBe(0);
		expect(economics.currentIncentive).toBeCloseTo(450.0, 2);
		expect(economics.incrementalIncentive).toBeCloseTo(3295.73, 2);
	});

	it('Example 2b: renewal bp -> bp_cb at 100 seats (US) — current leg gets Strategic', () => {
		// Starting on Business Premium, so the current leg also picks up Strategic.
		// current_part = 22 * 0.80 * 100 * 12 = 21,120
		// strategicCurrent = 21,120 * 0.03 = 633.60
		const economics = calculateIncentives({
			endingSkuId: 'bp_cb',
			targetPrice: 32,
			currentPrice: 22,
			seats: 100,
			journey: 'renewal',
			startingSkuId: 'bp',
		});
		expect(economics.cspCoreCurrent).toBeCloseTo(792.0, 2);
		expect(economics.strategicAcceleratorCurrent).toBeCloseTo(633.6, 2);
		expect(economics.currentIncentive).toBeCloseTo(1425.6, 2);
	});

	it('Example 3: new_customer target = bp_purview at 100 seats (US)', () => {
		// target_part = 32 * 0.80 * 100 * 12 = 30,720.00
		// New-customer journey: NO growth, NO current leg.
		const economics = calculateIncentives({
			endingSkuId: 'bp_purview',
			targetPrice: 32,
			currentPrice: 0,
			seats: 100,
			journey: 'new_customer',
		});
		expect(economics.cspCore).toBeCloseTo(1152.0, 2);
		expect(economics.strategicAccelerator).toBeCloseTo(921.6, 2);
		expect(economics.growthAccelerator).toBe(0);
		expect(economics.totalIncentive).toBeCloseTo(2073.6, 2);
		expect(economics.cspCoreCurrent).toBe(0);
		expect(economics.strategicAcceleratorCurrent).toBe(0);
		expect(economics.currentIncentive).toBe(0);
		expect(economics.incrementalIncentive).toBeCloseTo(2073.6, 2);
	});

	it('Example 4: non-premium ending SKU forces Strategic Accelerator to 0', () => {
		// target_part = 22 * 0.80 * 100 * 12 = 21,120 (unknown SKU → 20% default margin)
		// current_part = 6 * 0.80 * 100 * 12 =  5,760
		// growth_base  = 15,360
		const economics = calculateIncentives({
			endingSkuId: 'not_in_strategic_set',
			targetPrice: 22,
			currentPrice: 6,
			seats: 100,
			journey: 'renewal',
			endingSkuIsPremium: false,
		});
		expect(economics.strategicAccelerator).toBe(0);
		expect(economics.cspCore).toBeCloseTo(21120 * 0.0375, 2);
		expect(economics.growthAccelerator).toBeCloseTo(15360 * 0.075, 2);
		expect(economics.cspCoreCurrent).toBeCloseTo(5760 * 0.0375, 2);
	});

	it('Example 5: ineligible partner zeros all incentives', () => {
		const economics = calculateIncentives({
			endingSkuId: 'bs_cb',
			targetPrice: 22,
			currentPrice: 6,
			seats: 100,
			journey: 'renewal',
			isIncentiveEligible: false,
		});
		expect(economics.cspCore).toBe(0);
		expect(economics.strategicAccelerator).toBe(0);
		expect(economics.growthAccelerator).toBe(0);
		expect(economics.totalIncentive).toBe(0);
		expect(economics.cspCoreCurrent).toBe(0);
		expect(economics.strategicAcceleratorCurrent).toBe(0);
		expect(economics.currentIncentive).toBe(0);
		expect(economics.incrementalIncentive).toBe(0);
	});

	it('Example 6 (pinning): partner-entered prices passed via the explicit-prices scenario builder do NOT change incentives', async () => {
		// Same canonical inputs (bb -> bs_cb, US, 100 seats) but two different
		// partner-entered customer/reseller prices. Incentives must be identical.
		const { calculateScenarioFromExplicitPrices } = await import(
			'@/lib/rules-engine'
		);
		const startingSku = getStartingSku('bb');
		const endingSku = getEndingSku('bs_cb');

		const baseline = calculateScenarioFromExplicitPrices(
			startingSku,
			endingSku,
			100,
			{
				currentSkuCustomerPrice: 6,
				currentSkuResellerPrice: 4.8,
				targetSkuCustomerPrice: 22,
				targetSkuResellerPrice: 18.99,
			},
			{ journey: 'renewal' },
		);

		const partnerEdited = calculateScenarioFromExplicitPrices(
			startingSku,
			endingSku,
			100,
			{
				// Partner cranks both customer prices way up — must NOT move incentives.
				currentSkuCustomerPrice: 9,
				currentSkuResellerPrice: 7.2,
				targetSkuCustomerPrice: 25,
				targetSkuResellerPrice: 21.5,
			},
			{ journey: 'renewal' },
		);

		expect(partnerEdited.economics.cspCore).toBe(baseline.economics.cspCore);
		expect(partnerEdited.economics.strategicAccelerator).toBe(
			baseline.economics.strategicAccelerator,
		);
		expect(partnerEdited.economics.growthAccelerator).toBe(
			baseline.economics.growthAccelerator,
		);
		expect(partnerEdited.economics.totalIncentive).toBe(
			baseline.economics.totalIncentive,
		);
		expect(partnerEdited.economics.currentIncentive).toBe(
			baseline.economics.currentIncentive,
		);
		expect(partnerEdited.economics.incrementalIncentive).toBe(
			baseline.economics.incrementalIncentive,
		);
		// And the values match Example 1.
		expect(baseline.economics.cspCore).toBeCloseTo(854.37, 2);
		expect(baseline.economics.totalIncentive).toBeCloseTo(2814.61, 2);
		expect(baseline.economics.currentIncentive).toBeCloseTo(216.0, 2);
	});

	it('returns zeros when seats are zero', () => {
		expect(
			calculateIncentives({
				endingSkuId: 'bs_cb',
				targetPrice: 22,
				currentPrice: 6,
				seats: 0,
				journey: 'renewal',
			}),
		).toEqual({
			cspCore: 0,
			strategicAccelerator: 0,
			strategicAcceleratorRate: INCENTIVE_RATES.strategicAccelerator,
			growthAccelerator: 0,
			totalIncentive: 0,
			cspCoreCurrent: 0,
			strategicAcceleratorCurrent: 0,
			currentIncentive: 0,
			incrementalIncentive: 0,
		});
	});
});

describe('matchStartingSku', () => {
	it.each([
		['Microsoft 365 Business Basic', 'bb'],
		['O365 Business Essentials', 'bb'],
		['O365 Business Standard', 'bs'],
		['Office 365 Business Premium', 'bs'],
		['Microsoft 365 Business Premium', 'bp'],
		['M365 Apps for Business', null],
		['Microsoft 365 Apps for business', null],
		['Microsoft 365 E3', null],
		['Microsoft 365 E5', null],
		['Exchange Online Plan 1', null],
	])("maps '%s' correctly", (product, expectedId) => {
		const matched = matchStartingSku(product);
		expect(matched?.id ?? null).toBe(expectedId);
	});
});
