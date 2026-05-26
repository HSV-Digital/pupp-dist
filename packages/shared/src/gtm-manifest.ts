/**
 * GTM (Go-To-Market) asset manifest.
 *
 * Maps each ending-SKU ID to the exact folder name on disk (under
 * `static/gtm-assets/`) and the list of files available for that scenario.
 *
 * Shared by the Next.js frontend (to render selectable asset lists) and the
 * NestJS backend (to resolve file paths for zip bundling).
 */

export type GtmAssetCategory = 'deck' | 'email' | 'flyer' | 'social' | 'slider';

export interface GtmAssetEntry {
	/** Display name in the UI (e.g. "Customer Pitch Deck") */
	label: string;
	/** Exact filename on disk (e.g. "Customer pitch deck.pptx") */
	fileName: string;
	/** Asset category for grouping / icons */
	category: GtmAssetCategory;
}

export interface GtmScenarioAssets {
	/** Exact folder name under gtm-assets/ */
	folderName: string;
	/** Human-readable scenario name */
	label: string;
	/** Files available for this scenario */
	assets: GtmAssetEntry[];
}

// ── Shared email campaign files (security scenarios) ─────────────────
const SECURITY_EMAIL_CAMPAIGN: GtmAssetEntry[] = [
	{
		label: 'E-mail 1 – Elevate security and compliance',
		fileName: 'E-mail_1_Elevate security and compliance in this new world.oft',
		category: 'email',
	},
	{
		label: 'E-mail 2 – Elevate threat protection at SMB cost',
		fileName: 'E-mail_2_Elevate threat protection at SMB cost.oft',
		category: 'email',
	},
	{
		label: 'E-mail 3 – Prevent identity access risks',
		fileName: 'E-mail_3_Prevent identity access risks in a connected world.oft',
		category: 'email',
	},
	{
		label: 'E-mail 4 – Prevent advanced identity-based attacks',
		fileName:
			'E-mail_4_Prevent the risk of advanced identity-based attacks.oft',
		category: 'email',
	},
	{
		label: 'E-mail 5 – Prevent ransomware attacks',
		fileName:
			'E-mail_5_Prevent the risk of ransomware attacks across endpoints network.oft',
		category: 'email',
	},
	{
		label: 'E-mail 6 – Prevent advanced phishing and email threats',
		fileName: 'E-mail_6_Prevent advanced phishing and email threats.oft',
		category: 'email',
	},
	{
		label: 'E-mail 7 – Prevent shadow cloud and AI app risks',
		fileName:
			'E-mail_7_Prevent the risk from shadow cloud and AI applications.oft',
		category: 'email',
	},
	{
		label: 'E-mail 8 – Unlock the power and promise of AI',
		fileName: 'E-mail_8_Unlock the power and promise of AI.oft',
		category: 'email',
	},
	{
		label: 'E-mail 9 – Prevent data leak in the age of AI',
		fileName: 'E-mail_9_Prevent the risk of data leak in the age of AI.oft',
		category: 'email',
	},
	{
		label: 'E-mail 10 – Prevent data oversharing in the age of AI',
		fileName:
			'E-mail_10_Prevent the risk of data oversharing in the age of AI.oft',
		category: 'email',
	},
	{
		label: 'E-mail 11 – Prevent non-compliance in the age of AI',
		fileName:
			'E-mail_11_Prevent the risk of non-compliance in the age of AI.oft',
		category: 'email',
	},
];

export const GTM_MANIFEST: Record<string, GtmScenarioAssets> = {
	// ── Copilot scenarios ──────────────────────────────────────────────
	bs_cb: {
		folderName: 'Copilot Business and Business Standard',
		label: 'Copilot Business + Business Standard',
		assets: [
			{
				label: 'Customer Pitch Deck',
				fileName: 'Customer pitch deck.pptx',
				category: 'deck',
			},
			{
				label: 'Offering Flyer',
				fileName: 'Offering flyer.pptx',
				category: 'flyer',
			},
			{
				label: 'Partner Opportunity Deck',
				fileName: 'Partner opportunity deck.pptx',
				category: 'deck',
			},
			{
				label: 'Promotional E-mail',
				fileName: 'Promotional e-mail.oft',
				category: 'email',
			},
			{
				label: 'Promotional One-Slider',
				fileName: 'Promotional one-slider.pptx',
				category: 'slider',
			},
			{
				label: 'Social Post',
				fileName: 'Social post.pptx',
				category: 'social',
			},
		],
	},

	bp_cb: {
		folderName: 'Copilot Business and Business Premium',
		label: 'Copilot Business + Business Premium',
		assets: [
			{
				label: 'Customer Pitch Deck',
				fileName: 'Customer pitch deck.pptx',
				category: 'deck',
			},
			{
				label: 'Offering Flyer',
				fileName: 'Offering flyer.pptx',
				category: 'flyer',
			},
			{
				label: 'Partner Opportunity Deck',
				fileName: 'Partner opportunity deck.pptx',
				category: 'deck',
			},
			{
				label: 'Promotional One-Slider',
				fileName: 'Promotional one-slider.pptx',
				category: 'slider',
			},
			{
				label: 'Social Post',
				fileName: 'Social post.pptx',
				category: 'social',
			},
		],
	},

	bp_cb_purview: {
		folderName: 'CB + BP + Purview for Business Premium',
		label: 'Copilot Business + Business Premium + Purview',
		assets: [
			{
				label: 'Customer Pitch Deck',
				fileName: 'Customer pitch deck.pptx',
				category: 'deck',
			},
			{
				label: 'Offering Flyer',
				fileName: 'Offering flyer.pptx',
				category: 'flyer',
			},
			{
				label: 'Partner Opportunity Deck',
				fileName: 'Partner opportunity deck.pptx',
				category: 'deck',
			},
			{
				label: 'Promotional E-mail',
				fileName: 'Promotional e-mail.oft',
				category: 'email',
			},
			{
				label: 'Promotional One-Slider',
				fileName: 'Promotional one-slider.pptx',
				category: 'slider',
			},
			{
				label: 'Social Post',
				fileName: 'Social post.pptx',
				category: 'social',
			},
		],
	},

	// ── Security scenarios (with email campaigns) ──────────────────────
	bp_defender: {
		folderName: 'BP + Defender for BP',
		label: 'Business Premium + Defender',
		assets: [
			{
				label: 'Customer Pitch Deck',
				fileName: 'Customer pitch deck.pptx',
				category: 'deck',
			},
			{
				label: 'Offering Flyer',
				fileName: 'Offering flyer.pptx',
				category: 'flyer',
			},
			{
				label: 'Partner Opportunity Deck',
				fileName: 'Partner opportunity deck.pptx',
				category: 'deck',
			},
			...SECURITY_EMAIL_CAMPAIGN,
		],
	},

	bp_purview: {
		folderName: 'BP + Purview for BP',
		label: 'Business Premium + Purview',
		assets: [
			{
				label: 'Customer Pitch Deck',
				fileName: 'Customer pitch deck.pptx',
				category: 'deck',
			},
			{
				label: 'Offering Flyer',
				fileName: 'Offering flyer.pptx',
				category: 'flyer',
			},
			{
				label: 'Partner Opportunity Deck',
				fileName: 'Partner opportunity deck.pptx',
				category: 'deck',
			},
			...SECURITY_EMAIL_CAMPAIGN,
		],
	},

	bp_defender_purview: {
		folderName: 'BP + Defender + Purview for BP',
		label: 'Business Premium + Defender + Purview',
		assets: [
			{
				label: 'Customer Pitch Deck',
				fileName: 'Customer pitch deck.pptx',
				category: 'deck',
			},
			{
				label: 'Partner Opportunity Deck',
				fileName: 'Partner opportunity deck.pptx',
				category: 'deck',
			},
			...SECURITY_EMAIL_CAMPAIGN,
		],
	},
};

/** All valid ending-SKU IDs that have GTM assets. */
export const GTM_ENDING_SKU_IDS = Object.keys(GTM_MANIFEST);
