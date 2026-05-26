import { describe, expect, it } from 'vitest';
import { calculatePricing } from '@/lib/ppt/pricing';

describe('calculatePricing', () => {
	it('calculates good plan pricing from seat count', () => {
		expect(calculatePricing(10, 'good')).toEqual({
			numberOfSeats: 10,
			actualCost: 335,
			promoPricing: 220,
			promoCostSaving: 115,
		});
	});

	it('calculates better plan pricing from seat count', () => {
		expect(calculatePricing(10, 'better')).toEqual({
			numberOfSeats: 10,
			actualCost: 430,
			promoPricing: 320,
			promoCostSaving: 110,
		});
	});

	it('calculates best plan pricing from seat count', () => {
		expect(calculatePricing(10, 'best')).toEqual({
			numberOfSeats: 10,
			actualCost: 530,
			promoPricing: 370,
			promoCostSaving: 160,
		});
	});

	it('normalizes invalid and non-integer seats', () => {
		expect(calculatePricing(-3, 'good').numberOfSeats).toBe(0);
		expect(calculatePricing(3.8, 'good').numberOfSeats).toBe(3);
	});
});
