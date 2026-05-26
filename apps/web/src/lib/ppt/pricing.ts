import type { Plan } from '@/lib/ppt-types';

const PRICING = {
	good: {
		actual: 33.5,
		promo: 22,
		saving: 11.5,
	},
	better: {
		actual: 43,
		promo: 32,
		saving: 11,
	},
	best: {
		actual: 53,
		promo: 37,
		saving: 16,
	},
	'sec-defender': {
		actual: 32,
		promo: 32,
		saving: 0,
	},
	'sec-purview': {
		actual: 32,
		promo: 32,
		saving: 0,
	},
	'sec-full': {
		actual: 37,
		promo: 37,
		saving: 0,
	},
} as const;

export interface CalculatedPricing {
	numberOfSeats: number;
	actualCost: number;
	promoPricing: number;
	promoCostSaving: number;
}

export function calculatePricing(seats: number, plan: Plan): CalculatedPricing {
	const config = PRICING[plan];

	if (!config) {
		throw new Error(`Invalid plan: ${plan}`);
	}

	const normalizedSeats = normalizeSeats(seats);

	return {
		numberOfSeats: normalizedSeats,
		actualCost: round(normalizedSeats * config.actual),
		promoPricing: round(normalizedSeats * config.promo),
		promoCostSaving: round(normalizedSeats * config.saving),
	};
}

function normalizeSeats(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.floor(value));
}

function round(n: number) {
	return Math.round(n * 100) / 100;
}
