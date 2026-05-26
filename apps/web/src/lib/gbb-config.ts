import type { EndingSku } from '@repo/types';

export type ScenarioViewMode = 'gbb' | 'full';
export type GbbTier = 'good' | 'better' | 'best';

export interface GbbResolvedCard {
	tier: GbbTier;
	endingSku: EndingSku;
	message: string;
	badgeLabel: string;
	badgeColor: string;
}

interface GbbTierConfig {
	tier: GbbTier;
	endingSkuId: string;
	badgeLabel: string;
	badgeColor: string;
}

const GBB_SUPPORTED_STARTING_SKUS = new Set(['bb', 'bs', 'bp']);

const COPILOT_BUSINESS_ATTACH_TIERS: GbbTierConfig[] = [
	{
		tier: 'good',
		endingSkuId: 'bs_cb',
		badgeLabel: 'GOOD',
		badgeColor: '#5c6bc0',
	},
	{
		tier: 'better',
		endingSkuId: 'bp_cb',
		badgeLabel: 'BETTER',
		badgeColor: '#1565c0',
	},
	{
		tier: 'best',
		endingSkuId: 'bp_cb_purview',
		badgeLabel: 'BEST',
		badgeColor: '#6a1b9a',
	},
];

const TIER_TOP_LEVEL_MESSAGES: Record<GbbTier, string> = {
	good: 'Same great plan with an all-in-one AI productivity upgrade, built into the apps people love and use every day',
	better:
		'Save time and money by bringing together productivity apps, AI and security deeply integrated, in one bundle',
	best: 'Unmatched, AI-powered productivity while securing your sensitive data for a smarter, more secure way to work',
};

const PER_CELL_MESSAGES: Record<
	string,
	Partial<Record<GbbTier, string | null>>
> = {
	bb: {
		good: 'All Microsoft 365 apps, now available on desktop with built-in AI',
		better:
			'Bring together productivity apps, AI and security deeply integrated, in one bundle',
	},
	bs: {
		good: 'Same great plan with an all-in-one AI productivity upgrade',
		better:
			'Bring together productivity apps, AI and security deeply integrated, in one bundle',
	},
	bp: {
		good: null,
		better:
			'Same great plan with an all-in-one AI productivity upgrade and stronger safeguards',
	},
};

export function isGbbSupportedStartingSku(startingSkuId: string): boolean {
	return GBB_SUPPORTED_STARTING_SKUS.has(startingSkuId);
}

export function resolveGbbCards(
	startingSkuId: string,
	availableEndingSkus: EndingSku[],
): GbbResolvedCard[] {
	if (!isGbbSupportedStartingSku(startingSkuId)) {
		return [];
	}

	const endingSkuById = new Map(
		availableEndingSkus.map((endingSku) => [endingSku.id, endingSku]),
	);

	return COPILOT_BUSINESS_ATTACH_TIERS.flatMap((tierConfig) => {
		const perCellMessage = PER_CELL_MESSAGES[startingSkuId]?.[tierConfig.tier];
		if (perCellMessage === null) {
			return [];
		}

		const endingSku = endingSkuById.get(tierConfig.endingSkuId);
		if (!endingSku) {
			return [];
		}

		const message =
			typeof perCellMessage === 'string' && perCellMessage.trim().length > 0
				? perCellMessage
				: TIER_TOP_LEVEL_MESSAGES[tierConfig.tier];

		return [
			{
				tier: tierConfig.tier,
				endingSku,
				message,
				badgeLabel: tierConfig.badgeLabel,
				badgeColor: tierConfig.badgeColor,
			},
		];
	});
}
