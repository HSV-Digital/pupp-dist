import { describe, expect, it } from 'vitest';
import type { EndingSku } from '@repo/types';
import { ENDING_SKU_BY_ID } from '@/lib/upgrade-matrix';
import { isGbbSupportedStartingSku, resolveGbbCards } from '@/lib/gbb-config';

function getEndingSku(id: string): EndingSku {
	const sku = ENDING_SKU_BY_ID.get(id);
	if (!sku) {
		throw new Error(`Unknown ending SKU: ${id}`);
	}
	return sku;
}

function pickEndingSkus(ids: string[]): EndingSku[] {
	return ids.map((id) => getEndingSku(id));
}

describe('isGbbSupportedStartingSku', () => {
	it('supports business starting skus only', () => {
		expect(isGbbSupportedStartingSku('bb')).toBe(true);
		expect(isGbbSupportedStartingSku('bs')).toBe(true);
		expect(isGbbSupportedStartingSku('bp')).toBe(true);
		expect(isGbbSupportedStartingSku('m365')).toBe(false);
		expect(isGbbSupportedStartingSku('unknown')).toBe(false);
	});
});

describe('resolveGbbCards', () => {
	it('resolves all three tiers in order for Business Basic', () => {
		const cards = resolveGbbCards(
			'bb',
			pickEndingSkus(['bs_cb', 'bp_cb', 'bp_cb_purview', 'bp_defender']),
		);

		expect(cards.map((card) => card.tier)).toEqual(['good', 'better', 'best']);
		expect(cards.map((card) => card.endingSku.id)).toEqual([
			'bs_cb',
			'bp_cb',
			'bp_cb_purview',
		]);
		expect(cards.map((card) => card.badgeLabel)).toEqual([
			'GOOD',
			'BETTER',
			'BEST',
		]);
		expect(cards[0].message).toBe(
			'All Microsoft 365 apps, now available on desktop with built-in AI',
		);
		expect(cards[2].message).toBe(
			'Unmatched, AI-powered productivity while securing your sensitive data for a smarter, more secure way to work',
		);
	});

	it('hides Good for Business Premium and keeps Better/Best', () => {
		const cards = resolveGbbCards(
			'bp',
			pickEndingSkus(['bs_cb', 'bp_cb', 'bp_cb_purview']),
		);

		expect(cards.map((card) => card.tier)).toEqual(['better', 'best']);
		expect(cards.map((card) => card.endingSku.id)).toEqual([
			'bp_cb',
			'bp_cb_purview',
		]);
		expect(cards[0].message).toBe(
			'Same great plan with an all-in-one AI productivity upgrade and stronger safeguards',
		);
	});

	it('falls back to top-level message when per-cell is missing', () => {
		const cards = resolveGbbCards(
			'bs',
			pickEndingSkus(['bs_cb', 'bp_cb', 'bp_cb_purview']),
		);

		const bestCard = cards.find((card) => card.tier === 'best');
		expect(bestCard?.message).toBe(
			'Unmatched, AI-powered productivity while securing your sensitive data for a smarter, more secure way to work',
		);
	});

	it('omits tiers when mapped ending sku is not available', () => {
		const cards = resolveGbbCards('bb', pickEndingSkus(['bp_cb']));

		expect(cards.map((card) => card.tier)).toEqual(['better']);
		expect(cards.map((card) => card.endingSku.id)).toEqual(['bp_cb']);
	});

	it('returns empty for unsupported starting skus', () => {
		expect(resolveGbbCards('m365', pickEndingSkus(['bp_cb']))).toEqual([]);
	});
});
