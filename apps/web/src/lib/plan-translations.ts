// Maps ending-SKU ids (from `packages/shared/src/upgrade-matrix.ts`)
// onto translation keys in `messages/<locale>.json`. Consumers use these
// instead of the English strings baked into the shared data so plan
// descriptions and bullet lists localize.

type EndingSkuId =
	| 'bs_cb'
	| 'bp_cb'
	| 'bp_cb_purview'
	| 'bp_defender'
	| 'bp_purview'
	| 'bp_defender_purview';

export const PLAN_DESCRIPTION_KEY: Record<EndingSkuId, string> = {
	bs_cb: 'proposal.plans.copilotBusiness.description',
	bp_cb: 'proposal.plans.copilotBusinessSecurity.description',
	bp_cb_purview: 'proposal.plans.businessE5.description',
	bp_defender: 'proposal.plans.businessPremium.description',
	bp_purview: 'proposal.plans.complianceE5.description',
	bp_defender_purview: 'proposal.plans.businessSecurityCompliance.description',
};

export const PLAN_HIGHLIGHTS_KEYS: Record<EndingSkuId, string[]> = {
	bs_cb: [
		'proposal.features.webMobileDesktop',
		'proposal.features.aiSolutionGrounded',
		'proposal.features.builtInProtections',
	],
	bp_cb: [
		'proposal.features.everythingBusinessStandardCopilot',
		'proposal.features.conditionalAccess',
		'proposal.features.enhancedCyberthreat',
		'proposal.features.manualSensitivityLabels',
	],
	bp_cb_purview: [
		'proposal.features.everythingPremiumCopilot',
		'proposal.features.userSessionRisk',
		'proposal.features.automaticSensitivityLabels',
		'proposal.features.advancedDataSecurity',
		'proposal.features.detectionRiskyUsage',
	],
	bp_defender: [
		'proposal.features.everythingPremium',
		'proposal.features.comprehensiveXdr',
		'proposal.features.aiIdentityRisk',
		'proposal.features.aiEndpointSecurity',
		'proposal.features.aiPhishingProtection',
		'proposal.features.security400Apps',
	],
	bp_purview: [
		'proposal.features.everythingPremium',
		'proposal.features.aiDataLossPrevention',
		'proposal.features.automatedClassification',
		'proposal.features.simplifiedCompliance',
		'proposal.features.insiderRiskDetection',
	],
	bp_defender_purview: [
		'proposal.features.everythingPremium',
		'proposal.features.unifiedDataSecurity',
		'proposal.features.comprehensiveXdrLayered',
		'proposal.features.advancedComplianceIdentity',
		'proposal.features.endToEndGovernance',
	],
};

export function isKnownEndingSku(id: string): id is EndingSkuId {
	return id in PLAN_DESCRIPTION_KEY;
}
