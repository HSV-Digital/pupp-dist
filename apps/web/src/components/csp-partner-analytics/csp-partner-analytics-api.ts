import { resellerApiFetch } from '@/lib/reseller-api-client';

export type CspPartnerAnalyticsRange = '1d' | '7d' | '14d' | '30d';

export interface CspPartnerAnalyticsTileCounts {
	logins: number;
	uploads: number;
	views: number;
	generated: number;
}

export interface CspPartnerAnalyticsFilterOptionPartner {
	orgId: string;
	name: string;
}

export interface CspPartnerAnalyticsFilterOptions {
	partners: CspPartnerAnalyticsFilterOptionPartner[];
	countries: string[];
}

export interface CspPartnerAnalyticsFilters {
	range: CspPartnerAnalyticsRange;
	partnerOrgId: string | null;
	countries: string[];
}

export interface CspPartnerAnalyticsByCountryRow {
	country: string;
	views: number;
	generated: number;
}

export type CspPartnerSkuDimension = 'start' | 'end';

export interface CspPartnerAnalyticsByCountrySkuRow {
	country: string;
	count: number;
}

export interface CspPartnerAnalyticsSkuPieGridBox {
	endingSkuId: string;
	label: string;
	total: number;
	startingSkuCounts: Record<string, number>;
}

export interface CspPartnerAnalyticsSkuTabTotals {
	all: number;
	bySkuId: Record<string, number>;
}

function buildQuery(filters: CspPartnerAnalyticsFilters): string {
	const params = new URLSearchParams({ range: filters.range });
	if (filters.partnerOrgId) params.set('partner', filters.partnerOrgId);
	for (const country of filters.countries) {
		params.append('country', country);
	}
	return params.toString();
}

async function fetchJson<T>(path: string): Promise<T> {
	const response = await resellerApiFetch(path);
	if (!response.ok) {
		throw new Error(
			`CSP partner analytics request failed: ${response.status} ${response.statusText}`,
		);
	}
	return (await response.json()) as T;
}

export function fetchCspPartnerAnalyticsTileCounts(
	filters: CspPartnerAnalyticsFilters,
): Promise<CspPartnerAnalyticsTileCounts> {
	return fetchJson<CspPartnerAnalyticsTileCounts>(
		`/api/csp-partners/analytics/tile-counts?${buildQuery(filters)}`,
	);
}

export function fetchCspPartnerAnalyticsFilterOptions(
	filters: CspPartnerAnalyticsFilters,
): Promise<CspPartnerAnalyticsFilterOptions> {
	return fetchJson<CspPartnerAnalyticsFilterOptions>(
		`/api/csp-partners/analytics/filter-options?${buildQuery(filters)}`,
	);
}

export function fetchCspPartnerAnalyticsByCountry(
	filters: CspPartnerAnalyticsFilters,
): Promise<CspPartnerAnalyticsByCountryRow[]> {
	return fetchJson<CspPartnerAnalyticsByCountryRow[]>(
		`/api/csp-partners/analytics/by-country?${buildQuery(filters)}`,
	);
}

export function fetchCspPartnerAnalyticsByCountrySku(
	filters: CspPartnerAnalyticsFilters,
	dimension: CspPartnerSkuDimension,
	skuId: string,
): Promise<CspPartnerAnalyticsByCountrySkuRow[]> {
	const params = new URLSearchParams({
		range: filters.range,
		dimension,
		skuId,
	});
	if (filters.partnerOrgId) params.set('partner', filters.partnerOrgId);
	for (const country of filters.countries) {
		params.append('country', country);
	}
	return fetchJson<CspPartnerAnalyticsByCountrySkuRow[]>(
		`/api/csp-partners/analytics/by-country-sku?${params.toString()}`,
	);
}

export function fetchCspPartnerAnalyticsSkuTabTotals(
	filters: CspPartnerAnalyticsFilters,
	dimension: CspPartnerSkuDimension,
): Promise<CspPartnerAnalyticsSkuTabTotals> {
	const params = new URLSearchParams({
		range: filters.range,
		dimension,
	});
	if (filters.partnerOrgId) params.set('partner', filters.partnerOrgId);
	for (const country of filters.countries) {
		params.append('country', country);
	}
	return fetchJson<CspPartnerAnalyticsSkuTabTotals>(
		`/api/csp-partners/analytics/sku-tab-totals?${params.toString()}`,
	);
}

export function fetchCspPartnerAnalyticsSkuPieGrid(
	filters: CspPartnerAnalyticsFilters,
): Promise<CspPartnerAnalyticsSkuPieGridBox[]> {
	return fetchJson<CspPartnerAnalyticsSkuPieGridBox[]>(
		`/api/csp-partners/analytics/sku-pie-grid?${buildQuery(filters)}`,
	);
}

export async function recordCspPartnerViewProposalEvent(
	customerName: string,
): Promise<void> {
	try {
		await resellerApiFetch(
			'/api/csp-partners/analytics/events/view-proposal',
			{
				method: 'POST',
				body: JSON.stringify({ customerName }),
			},
		);
	} catch {
		// Fire-and-forget: analytics must never break the proposal flow.
	}
}
