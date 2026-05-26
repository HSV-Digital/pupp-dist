import { describe, expect, it } from 'vitest';
import { SkuCategory } from '@repo/types';
import { categorizeProduct, SKU_COLORS } from './sku-utils';

describe('categorizeProduct', () => {
	it('categorizes Copilot products', () => {
		expect(categorizeProduct('Microsoft 365 Copilot')).toBe(
			SkuCategory.Copilot,
		);
		expect(categorizeProduct('copilot for M365')).toBe(SkuCategory.Copilot);
	});

	it('categorizes E5 products', () => {
		expect(categorizeProduct('Microsoft 365 E5')).toBe(SkuCategory.E5);
		expect(categorizeProduct('Office 365 E5 (no Teams)')).toBe(SkuCategory.E5);
	});

	it('categorizes E3 products', () => {
		expect(categorizeProduct('Microsoft 365 E3')).toBe(SkuCategory.E3);
		expect(categorizeProduct('Office 365 E3')).toBe(SkuCategory.E3);
	});

	it('categorizes Premium products', () => {
		expect(categorizeProduct('Microsoft 365 Business Premium')).toBe(
			SkuCategory.Premium,
		);
		expect(categorizeProduct('PREMIUM plan')).toBe(SkuCategory.Premium);
	});

	it('categorizes Standard products', () => {
		expect(categorizeProduct('Microsoft 365 Business Standard')).toBe(
			SkuCategory.Standard,
		);
		expect(categorizeProduct('standard')).toBe(SkuCategory.Standard);
	});

	it('categorizes Basic products', () => {
		expect(categorizeProduct('Microsoft 365 Business Basic')).toBe(
			SkuCategory.Basic,
		);
		expect(categorizeProduct('BASIC')).toBe(SkuCategory.Basic);
	});

	it('returns Other for unknown products', () => {
		expect(categorizeProduct('Some Unknown Product')).toBe(SkuCategory.Other);
		expect(categorizeProduct('Exchange Online Plan 1')).toBe(SkuCategory.Other);
	});

	it('handles case insensitivity', () => {
		expect(categorizeProduct('MICROSOFT 365 E5')).toBe(SkuCategory.E5);
		expect(categorizeProduct('microsoft 365 basic')).toBe(SkuCategory.Basic);
		expect(categorizeProduct('Microsoft 365 STANDARD')).toBe(
			SkuCategory.Standard,
		);
	});

	it('prioritizes Copilot over other categories', () => {
		expect(categorizeProduct('Microsoft 365 E5 + Copilot')).toBe(
			SkuCategory.Copilot,
		);
		expect(categorizeProduct('Premium + Copilot')).toBe(SkuCategory.Copilot);
	});
});

describe('SKU_COLORS', () => {
	it('has an entry for every SkuCategory', () => {
		for (const category of Object.values(SkuCategory)) {
			expect(SKU_COLORS[category]).toBeDefined();
			expect(typeof SKU_COLORS[category]).toBe('string');
		}
	});
});
