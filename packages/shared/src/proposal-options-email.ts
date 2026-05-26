import type { DashboardViewMode } from '@repo/types';
import { ENDING_SKU_BY_ID, VALID_UPGRADE_PATHS } from './upgrade-matrix';

export type ProposalOptionsJourney = 'new_customer' | 'renewal';
export type ProposalOptionsFilter = 'ai' | 'security' | 'all';
export type StartingSkuId = 'bb' | 'bs' | 'bp' | 'other';

export interface ProposalOptionsTemplateSelection {
	journey: ProposalOptionsJourney;
	filter: ProposalOptionsFilter;
}

export interface ProposalFlyerSelection {
	journey: ProposalOptionsJourney;
	startingSkuId: StartingSkuId;
	endingSkuId: string;
	useChatToPaidFlyers?: boolean;
}

const CHAT_TO_PAID_FLYER_SUBDIR = 'Copilot Chat';

export type OpportunityListUpgradeCategory = 'ai' | 'security' | 'mixed';

/**
 * "Best for" descriptions keyed by Ending SKU id.
 */
export const OPPORTUNITY_LIST_SKU_BEST_FOR: Record<string, string> = {
	bs_cb:
		'AI productivity uplift across Microsoft 365 apps with baseline protections',
	bp_cb:
		'AI productivity and stronger identity/device access controls and enhanced threat protection',
	bp_cb_purview:
		'AI productivity plus advanced data security/compliance controls',
	bp_defender: 'Security upgrade across devices, email, identities, and apps',
	bp_purview: 'Data security, compliance, and governance',
	bp_defender_purview: 'Most comprehensive security + compliance coverage',
};

const PROPOSAL_OPTIONS_TEMPLATE_BY_KEY: Record<
	`${ProposalOptionsJourney}:${ProposalOptionsFilter}`,
	string
> = {
	'new_customer:ai':
		'/email_templates/partner/proposal_options/new_customer/new_customer.docx',
	'new_customer:security':
		'/email_templates/partner/proposal_options/new_customer/new_customer.docx',
	'new_customer:all':
		'/email_templates/partner/proposal_options/new_customer/new_customer.docx',
	'renewal:ai': '/email_templates/partner/proposal_options/renewal/ai.docx',
	'renewal:security':
		'/email_templates/partner/proposal_options/renewal/security.docx',
	'renewal:all':
		'/email_templates/partner/proposal_options/renewal/ai_and_security.docx',
};

const FLYER_TEMPLATE_BY_KEY: Record<string, string> = {
	// Renewal - AI
	'renewal:bb:bs_cb': 'single_renewal_ai/bb_to_bs_and_cb.pptx',
	'renewal:bb:bp_cb': 'single_renewal_ai/bb_to_bp_and_cb.pptx',
	'renewal:bb:bp_cb_purview':
		'single_renewal_ai/bb_to_bp_and_cb_and_purview_suite.pptx',
	'renewal:bs:bs_cb': 'single_renewal_ai/bs_to_bs_and_cb.pptx',
	'renewal:bs:bp_cb': 'single_renewal_ai/bs_to_bp_and_cb.pptx',
	'renewal:bs:bp_cb_purview':
		'single_renewal_ai/bs_to_bp_and_cb_and_purview_suite.pptx',
	'renewal:bp:bp_cb': 'single_renewal_ai/bp_to_bp_and_cb.pptx',
	'renewal:bp:bp_cb_purview':
		'single_renewal_ai/bp_to_bp_and_cb_and_purview_suite.pptx',

	// Renewal - Security
	'renewal:bb:bp_defender': 'single_renewal_security/bb_to_defender_suite.pptx',
	'renewal:bb:bp_purview': 'single_renewal_security/bb_to_purview_suite.pptx',
	'renewal:bb:bp_defender_purview':
		'single_renewal_security/bb_to_defender_and_purview_suite.pptx',
	'renewal:bs:bp_defender': 'single_renewal_security/bs_to_defender_suite.pptx',
	'renewal:bs:bp_purview': 'single_renewal_security/bs_to_purview_suite.pptx',
	'renewal:bs:bp_defender_purview':
		'single_renewal_security/bs_to_defender_and_purview_suite.pptx',
	'renewal:bp:bp_defender': 'single_renewal_security/bp_to_defender_suite.pptx',
	'renewal:bp:bp_purview': 'single_renewal_security/bp_to_purview_suite.pptx',
	'renewal:bp:bp_defender_purview':
		'single_renewal_security/bp_to_defender_and_purview_suite.pptx',

	// New customer - Starting SKU (bb/bs/bp) to AI
	'new_customer:bb:bs_cb': 'new_customer_b_sku_to_ai/bb_to_bs_and_cb.pptx',
	'new_customer:bb:bp_cb': 'new_customer_b_sku_to_ai/bb_to_bp_and_cb.pptx',
	'new_customer:bb:bp_cb_purview':
		'new_customer_b_sku_to_ai/bb_to_bp_and_cb_and_purview_suite.pptx',
	'new_customer:bs:bs_cb': 'new_customer_b_sku_to_ai/bs_to_bs_and_cb.pptx',
	'new_customer:bs:bp_cb': 'new_customer_b_sku_to_ai/bs_to_bp_and_cb.pptx',
	'new_customer:bs:bp_cb_purview':
		'new_customer_b_sku_to_ai/bs_to_bp_and_cb_and_purview_suite.pptx',
	'new_customer:bp:bp_cb': 'new_customer_b_sku_to_ai/bp_to_bp_and_cb.pptx',
	'new_customer:bp:bp_cb_purview':
		'new_customer_b_sku_to_ai/bp_to_bp_and_cb_and_purview_suite.pptx',

	// New customer - Starting SKU (bb/bs/bp) to Security
	'new_customer:bb:bp_defender':
		'new_customer_b_sku_to_security/bb_to_defender_suite.pptx',
	'new_customer:bb:bp_purview':
		'new_customer_b_sku_to_security/bb_to_purview_suite.pptx',
	'new_customer:bb:bp_defender_purview':
		'new_customer_b_sku_to_security/bb_to_defender_and_purview_suite.pptx',
	'new_customer:bs:bp_defender':
		'new_customer_b_sku_to_security/bs_to_defender_suite.pptx',
	'new_customer:bs:bp_purview':
		'new_customer_b_sku_to_security/bs_to_purview_suite.pptx',
	'new_customer:bs:bp_defender_purview':
		'new_customer_b_sku_to_security/bs_to_defender_and_purview_suite.pptx',
	'new_customer:bp:bp_defender':
		'new_customer_b_sku_to_security/bp_to_defender_suite.pptx',
	'new_customer:bp:bp_purview':
		'new_customer_b_sku_to_security/bp_to_purview_suite.pptx',
	'new_customer:bp:bp_defender_purview':
		'new_customer_b_sku_to_security/bp_to_defender_and_purview_suite.pptx',

	// New customer - Starting SKU "other" to AI
	'new_customer:other:bs_cb':
		'new_customer_other_to_ai/others_to_bs_and_cb.pptx',
	'new_customer:other:bp_cb':
		'new_customer_other_to_ai/others_to_bp_and_cb.pptx',
	'new_customer:other:bp_cb_purview':
		'new_customer_other_to_ai/others_to_bp_and_cb_and_purview_suite.pptx',

	// New customer - Starting SKU "other" to Security
	'new_customer:other:bp_defender':
		'new_customer_other_to_security/others_to_defender_suite.pptx',
	'new_customer:other:bp_purview':
		'new_customer_other_to_security/others_to_purview_suite.pptx',
	'new_customer:other:bp_defender_purview':
		'new_customer_other_to_security/others_to_defender_and_purview_suite.pptx',
};

function toTemplateKey({
	journey,
	filter,
}: ProposalOptionsTemplateSelection): `${ProposalOptionsJourney}:${ProposalOptionsFilter}` {
	return `${journey}:${filter}`;
}

function toFlyerKey({
	journey,
	startingSkuId,
	endingSkuId,
}: ProposalFlyerSelection): string {
	return `${journey}:${startingSkuId}:${endingSkuId}`;
}

function toOpportunityTemplateViewMode(
	viewMode: DashboardViewMode,
): 'reseller' | 'customer' | 'opportunity' {
	if (viewMode === 'reseller') return 'reseller';
	if (viewMode === 'customer') return 'customer';
	return 'opportunity';
}

function resolveOpportunityTemplateSubfolder(
	viewMode: 'reseller' | 'customer' | 'opportunity',
): 'reseller_list' | 'customer_and_opportunity_list' {
	if (viewMode === 'reseller') {
		return 'reseller_list';
	}
	return 'customer_and_opportunity_list';
}

function resolveOpportunityTemplateFileName(
	_category: OpportunityListUpgradeCategory,
): 'ai.docx' {
	return 'ai.docx';
}

export function resolveProposalOptionsTemplatePath(
	selection: ProposalOptionsTemplateSelection,
): string {
	return PROPOSAL_OPTIONS_TEMPLATE_BY_KEY[toTemplateKey(selection)];
}

export function resolveProposalFlyerTemplatePath(
	selection: ProposalFlyerSelection,
): string | null {
	const relativePath = FLYER_TEMPLATE_BY_KEY[toFlyerKey(selection)] ?? null;
	if (!relativePath) {
		return null;
	}
	if (selection.useChatToPaidFlyers) {
		return `${CHAT_TO_PAID_FLYER_SUBDIR}/${relativePath}`;
	}
	return relativePath;
}

export function resolveOpportunityListUpgradeCategory(
	selectedSkuIds: Iterable<string>,
): OpportunityListUpgradeCategory | null {
	let hasAi = false;
	let hasSecurity = false;

	for (const skuId of selectedSkuIds) {
		const sku = ENDING_SKU_BY_ID.get(skuId);
		if (!sku) continue;

		if (sku.upgradeType === 'AI') {
			hasAi = true;
			continue;
		}

		if (sku.upgradeType === 'Security') {
			hasSecurity = true;
		}
	}

	if (hasAi && hasSecurity) return 'mixed';
	if (hasAi) return 'ai';
	if (hasSecurity) return 'security';
	return null;
}

export function resolveOpportunityListTemplatePath(params: {
	viewMode: DashboardViewMode;
	selectedSkuIds: Iterable<string>;
}): string | null {
	const category = resolveOpportunityListUpgradeCategory(params.selectedSkuIds);
	if (!category) {
		return null;
	}

	const normalizedViewMode = toOpportunityTemplateViewMode(params.viewMode);
	const subfolder = resolveOpportunityTemplateSubfolder(normalizedViewMode);
	const fileName = resolveOpportunityTemplateFileName(category);
	return `/email_templates/partner/opportunity_list/${subfolder}/${fileName}`;
}

export function resolveEndingSkuIdsForFilter(params: {
	startingSkuId: StartingSkuId;
	filter: ProposalOptionsFilter;
}): string[] {
	const allowedEndingSkuIds = VALID_UPGRADE_PATHS[params.startingSkuId] ?? [];

	return allowedEndingSkuIds.filter((endingSkuId) => {
		const endingSku = ENDING_SKU_BY_ID.get(endingSkuId);
		if (!endingSku) return false;

		if (params.filter === 'all') return true;
		if (params.filter === 'ai') return endingSku.upgradeType === 'AI';
		return endingSku.upgradeType === 'Security';
	});
}
