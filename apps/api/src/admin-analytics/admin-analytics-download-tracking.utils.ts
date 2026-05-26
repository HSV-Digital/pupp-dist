import { buildWhereClause } from '../dashboard/dashboard-query-builder';
import type { DashboardFilterState } from '../dashboard/dashboard.types';
import { subscriptions } from '../database/schema';
import type {
	DlTokenPayload,
	PdfFiltersPayload,
	ProposalPptScenarioPayload,
} from '../pdf/types/dl-token.types';

export const ADMIN_ANALYTICS_DOWNLOAD_CATEGORY = {
	customerLists: 'customer-lists',
	emailOpportunityLists: 'email-opportunity-lists',
	emailProposalOptions: 'email-proposal-options',
	proposals: 'proposals',
	proposalsGenerated: 'proposals-generated',
	resellerLists: 'reseller-lists',
} as const;

export type AdminAnalyticsDownloadCategory =
	(typeof ADMIN_ANALYTICS_DOWNLOAD_CATEGORY)[keyof typeof ADMIN_ANALYTICS_DOWNLOAD_CATEGORY];

export interface DownloadSummary {
	canadaEntityCount: number;
	entityCount: number;
	latamEntityCount: number;
	usEntityCount: number;
}

export interface EntityRegionRow {
	entityId: string;
	region: string;
}

export const EMPTY_DOWNLOAD_SUMMARY: DownloadSummary = {
	entityCount: 0,
	usEntityCount: 0,
	canadaEntityCount: 0,
	latamEntityCount: 0,
};

export function mapDlTokenScopeToDownloadCategory(
	scope: DlTokenPayload['scope'] | string,
): AdminAnalyticsDownloadCategory | null {
	switch (scope) {
		case 'customer-list':
			return ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists;
		case 'reseller-list':
			return ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.resellerLists;
		case 'proposal-assets-bundle':
		case 'proposal-ppt':
			return ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.proposals;
		case 'proposal-assets-load':
			return ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.proposalsGenerated;
		case 'email-opportunity-list':
			return ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.emailOpportunityLists;
		case 'email-proposal-options':
			return ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.emailProposalOptions;
		default:
			return null;
	}
}

export function toDashboardFilters(
	filters: PdfFiltersPayload,
): DashboardFilterState {
	return {
		pssAIWorkforce: filters.pssAIWorkforce,
		pssAISecurity: filters.pssAISecurity,
		psa: filters.psa,
		distributor: filters.distributor,
		reseller: filters.reseller,
		customer: filters.customer,
		pdm: filters.pdm,
		pmm: filters.pmm,
		region: filters.region ?? [],
		type: filters.type ?? [],
		skuCategory: filters.skuCategory ?? [],
		expSeats: filters.expSeats,
		renewalDate: filters.renewalDate,
		pastRenewalDate: filters.pastRenewalDate ?? [],
	};
}

export function withResellerFilter(
	filters: PdfFiltersPayload,
	resellerId?: string,
): PdfFiltersPayload {
	if (!resellerId || resellerId.trim().length === 0) {
		return filters;
	}

	return {
		...filters,
		reseller: [resellerId],
	};
}

export function buildSubscriptionWhereClause(params: {
	tokenPayload: DlTokenPayload;
	category: Extract<
		AdminAnalyticsDownloadCategory,
		'customer-lists' | 'reseller-lists'
	>;
}) {
	const filters =
		params.category === ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists
			? toDashboardFilters(
					withResellerFilter(
						params.tokenPayload.filters,
						params.tokenPayload.resellerId,
					),
				)
			: toDashboardFilters(params.tokenPayload.filters);

	return buildWhereClause({
		filters,
		search: params.tokenPayload.filters.search,
	});
}

export function buildProposalSummary(
	tokenPayload: DlTokenPayload,
): DownloadSummary {
	const scenarios =
		tokenPayload.proposalAssetsBundle?.scenarios ??
		tokenPayload.proposalPpt?.scenarios ??
		[];

	if (scenarios.length === 0) {
		return EMPTY_DOWNLOAD_SUMMARY;
	}

	const entityRows: EntityRegionRow[] = scenarios.map((scenario) => ({
		entityId: getProposalScenarioEntityId(scenario),
		region: scenario.region ?? '',
	}));

	return summarizeEntityRows(entityRows);
}

export function summarizeEntityRows(rows: EntityRegionRow[]): DownloadSummary {
	if (rows.length === 0) {
		return EMPTY_DOWNLOAD_SUMMARY;
	}

	const allEntities = new Set<string>();
	const usEntities = new Set<string>();
	const canadaEntities = new Set<string>();
	const latamEntities = new Set<string>();

	for (const row of rows) {
		const entityId = row.entityId.trim();
		if (entityId.length === 0) {
			continue;
		}

		allEntities.add(entityId);
		switch (normalizeRegionBucket(row.region)) {
			case 'us':
				usEntities.add(entityId);
				break;
			case 'canada':
				canadaEntities.add(entityId);
				break;
			case 'latam':
				latamEntities.add(entityId);
				break;
			default:
				break;
		}
	}

	return {
		entityCount: allEntities.size,
		usEntityCount: usEntities.size,
		canadaEntityCount: canadaEntities.size,
		latamEntityCount: latamEntities.size,
	};
}

export function normalizeRegionBucket(
	region: string,
): 'canada' | 'latam' | 'other' | 'us' {
	const normalized = region.trim().toLowerCase();
	if (normalized === 'us' || normalized === 'united states') {
		return 'us';
	}

	if (normalized === 'ca' || normalized === 'canada') {
		return 'canada';
	}

	if (normalized.length === 0) {
		return 'other';
	}

	return 'latam';
}

export function getProposalScenarioEntityId(
	scenario: ProposalPptScenarioPayload,
): string {
	return `${scenario.opportunityId}:${scenario.endingSkuId}`;
}

export { subscriptions };
