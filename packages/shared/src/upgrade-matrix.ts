import type { EndingSku, StartingSku, UpgradeType } from '@repo/types';

const UPGRADE_TYPE = {
	AI: 'AI' as unknown as UpgradeType,
	SECURITY: 'Security' as unknown as UpgradeType,
} as const;

export const STARTING_SKUS: StartingSku[] = [
	{ id: 'bb', name: 'Business Basic', monthlyPrice: 6.0 },
	{ id: 'bs', name: 'Business Standard', monthlyPrice: 12.5 },
	{ id: 'bp', name: 'Business Premium', monthlyPrice: 22.0 },
	{ id: 'other', name: 'Other', monthlyPrice: 0 },
];

export const ENDING_SKUS: EndingSku[] = [
	{
		id: 'bs_cb',
		name: 'Business Standard + Copilot Business',
		upgradeType: UPGRADE_TYPE.AI,
		listPrice: 33.5,
		promoPrice: 22,
		tagline: 'Unlock AI-powered Productivity',
		oneLiner:
			'bring generative AI directly into the Microsoft 365 apps people use every day',
		description:
			'All-in one AI productivity upgrade, built into the apps people use everyday.',
		planHighlights: [
			'Web, mobile, and desktop versions of productivity apps',
			'All-in-one AI solution grounded in work data with chat, agents, and search',
			'Built-in protections like encryption and multi-factor sign-in',
		],
		solutionCapabilities: [
			"All-in-one AI solution, grounded in unique work data for responses relevant for the organization's context",
			'AI built into apps people use every day such as Word, PowerPoint, Excel, Teams, and Outlook',
			'Ability to build agents with Copilot Studio',
			'Built-in protections like encryption and multi-factor sign-in',
		],
	},
	{
		id: 'bp_cb',
		name: 'Business Premium + Copilot Business',
		upgradeType: UPGRADE_TYPE.AI,
		listPrice: 43,
		promoPrice: 32,
		tagline: 'Unlock Secure AI Transformation',
		oneLiner:
			'combine AI-powered productivity and strong security controls in one solution',
		description:
			'AI-powered productivity and security in one comprehensive solution.',
		planHighlights: [
			'Everything in Business Standard and Copilot Business',
			'Conditional access policies based on identity, device, location, and network',
			'Enhanced cyberthreat protection',
			'Manual data sensitivity and retention labels',
		],
		solutionCapabilities: [
			"All-in-one AI solution, grounded in unique work data for responses relevant for the organization's context",
			'AI built into apps people use every day such as Word, PowerPoint, Excel, Teams, and Outlook',
			'Enhanced security with conditional access policies, integrated cyber security, and manual data sensitivity and retention labels',
			'Ability to build agents with Copilot Studio',
		],
	},
	{
		id: 'bp_cb_purview',
		name: 'Business Premium + Copilot Business + Purview Suite',
		upgradeType: UPGRADE_TYPE.AI,
		listPrice: 53,
		promoPrice: 37,
		tagline: 'Enhance Security and AI Productivity',
		oneLiner:
			'deliver the most secure AI experience to your employees and automatically protect sensitive data',
		description: 'The most secure AI solution for businesses.',
		planHighlights: [
			'Everything in Business Premium and Copilot Business',
			'User and session risk and access control',
			'Automatic sensitivity and retention labels',
			'Advanced data security and compliance controls',
			'Detection and investigation of risky usage',
		],
		solutionCapabilities: [
			"All-in-one AI solution, grounded in unique work data for responses relevant for the organization's context",
			'AI built into apps people use every day such as Word, PowerPoint, Excel, Teams, and Outlook',
			'The most advanced security to prevent data oversharing, data leaks, and non-compliance',
			'Ability to build agents with Copilot Studio',
		],
	},
	{
		id: 'bp_defender',
		name: 'Business Premium + Defender Suite',
		upgradeType: UPGRADE_TYPE.SECURITY,
		listPrice: 32,
		promoPrice: 32,
		tagline: 'Elevate Security and Compliance',
		oneLiner: 'strengthen security across devices, email, identities, and apps',
		description:
			'Enhanced security across devices, email, identities, and apps at SMB price.',
		planHighlights: [
			'Everything in Business Premium',
			'Comprehensive XDR capabilities',
			'AI-driven identity risk detection and automated response',
			'AI-powered endpoint security',
			'Enhanced AI-driven phishing protection',
			'Security across 400+ AI apps',
		],
		solutionCapabilities: [
			'Unified solution to simplify data security, compliance, and governance',
			'Comprehensive XDR with layered threat protection across devices, email, identities, and apps',
			'Up to 68% cost savings with a consolidated solution to replace point security solutions',
		],
	},
	{
		id: 'bp_purview',
		name: 'Business Premium + Purview Suite',
		upgradeType: UPGRADE_TYPE.SECURITY,
		listPrice: 32,
		promoPrice: 32,
		tagline: 'Elevate Threat Protection',
		oneLiner:
			'secure, govern, and ensure compliance across your entire data estate',
		description:
			'Unified approach to data security, compliance, and governance.',
		planHighlights: [
			'Everything in Business Premium',
			'AI-powered data loss prevention across email, files, and apps',
			'Automated classification, labeling, and records management',
			'Simplified compliance posture',
			'Insider-risk detection and remediation',
		],
		solutionCapabilities: [
			'Comprehensive XDR capabilities across devices, email, identities, and apps',
			'Machine speed defence with AI-driven identity risk detection and response',
			'Built-in preventative controls and posture management capabilities',
			'Up to 65% cost savings with a consolidated solution to replace point security solutions',
		],
	},
	{
		id: 'bp_defender_purview',
		name: 'Business Premium + Purview Suite + Defender Suite',
		upgradeType: UPGRADE_TYPE.SECURITY,
		listPrice: 37,
		promoPrice: 37,
		tagline: 'Elevate Compliance and Governance',
		oneLiner:
			'build enterprise-grade security and compliance while optimizing licensing cost by up to 68%',
		description:
			'All-in-one protection across internal and external threats while saving up to 68% cost.',
		planHighlights: [
			'Everything in Business Premium',
			'Unified solution for data security, compliance, and governance',
			'Comprehensive XDR with layered threat protection',
			'Advanced compliance and identity management',
			'End-to-end governance capabilities',
		],
		solutionCapabilities: [
			'AI-powered data loss prevention across email, files, and apps',
			'Automated classification, labelling, and records management',
			'Integrated compliance tools to streamline investigations and enforce legal holds',
			'Up to 47% cost savings with a consolidated solution to replace point security solutions',
		],
	},
];

export const VALID_UPGRADE_PATHS: Record<string, string[]> = {
	bb: [
		'bs_cb',
		'bp_cb',
		'bp_cb_purview',
		'bp_defender',
		'bp_purview',
		'bp_defender_purview',
	],
	bs: [
		'bs_cb',
		'bp_cb',
		'bp_cb_purview',
		'bp_defender',
		'bp_purview',
		'bp_defender_purview',
	],
	bp: [
		'bp_cb',
		'bp_cb_purview',
		'bp_defender',
		'bp_purview',
		'bp_defender_purview',
	],
	other: [
		'bs_cb',
		'bp_cb',
		'bp_cb_purview',
		'bp_defender',
		'bp_purview',
		'bp_defender_purview',
	],
};

export const UPGRADE_PRICING_MATRIX: Record<
	string,
	Record<string, number | null>
> = {
	bb: {
		bs_cb: 16.0,
		bp_cb: 26.0,
		bp_cb_purview: 31.0,
		bp_defender: 26.0,
		bp_purview: 26.0,
		bp_defender_purview: 31.0,
	},
	bs: {
		bs_cb: 9.5,
		bp_cb: 19.5,
		bp_cb_purview: 24.5,
		bp_defender: 19.5,
		bp_purview: 19.5,
		bp_defender_purview: 24.5,
	},
	bp: {
		bs_cb: null,
		bp_cb: 10.0,
		bp_cb_purview: 15.0,
		bp_defender: 10.0,
		bp_purview: 10.0,
		bp_defender_purview: 15.0,
	},
	other: {
		bs_cb: 22.0,
		bp_cb: 32.0,
		bp_cb_purview: 37.0,
		bp_defender: 32.0,
		bp_purview: 32.0,
		bp_defender_purview: 37.0,
	},
};

export const INCENTIVE_RATES = {
	cspCore: 0.0375,
	strategicAccelerator: 0.03,
	growthAccelerator: 0.075,
	totalRate: 0.1425,
} as const;

export const NEW_CUSTOMER_INCENTIVE_RATE = 0.02;

/**
 * Ending SKU IDs that qualify for the Strategic Accelerator incentive.
 * Includes Business Standard + Copilot Business and all Business Premium
 * ending SKUs.
 */
export const STRATEGIC_ACCELERATOR_SKU_IDS: ReadonlySet<string> = new Set([
	'bs_cb',
	'bp_cb',
	'bp_cb_purview',
	'bp_defender',
	'bp_purview',
	'bp_defender_purview',
]);

/** Starting SKU ID that qualifies for Strategic Accelerator on the current leg. */
export const STRATEGIC_ACCELERATOR_STARTING_SKU_ID = 'bp';

export const STARTING_SKU_BY_ID = new Map(
	STARTING_SKUS.map((sku) => [sku.id, sku]),
);

export const ENDING_SKU_BY_ID = new Map(
	ENDING_SKUS.map((sku) => [sku.id, sku]),
);
