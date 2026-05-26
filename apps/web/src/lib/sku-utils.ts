import { SkuCategory } from '@repo/types';

export function categorizeProduct(productName: string): SkuCategory {
	const lower = productName.toLowerCase();

	if (lower.includes('copilot')) return SkuCategory.Copilot;
	if (lower.includes('e5')) return SkuCategory.E5;
	if (lower.includes('e3')) return SkuCategory.E3;
	if (lower.includes('premium')) return SkuCategory.Premium;
	if (lower.includes('standard')) return SkuCategory.Standard;
	if (lower.includes('basic')) return SkuCategory.Basic;

	return SkuCategory.Other;
}

export const SKU_COLORS: Record<SkuCategory, string> = {
	[SkuCategory.Basic]: 'blue',
	[SkuCategory.Standard]: 'green',
	[SkuCategory.Premium]: 'purple',
	[SkuCategory.E3]: 'amber',
	[SkuCategory.E5]: 'pink',
	[SkuCategory.Copilot]: 'indigo',
	[SkuCategory.Other]: 'grey',
};
