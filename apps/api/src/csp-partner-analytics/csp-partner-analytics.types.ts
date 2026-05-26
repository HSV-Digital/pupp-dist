import type {
	CspPartnerCountry,
	CspPartnerEndingSkuId,
	CspPartnerEventType,
	CspPartnerStartingSkuId,
} from '../database/schema';

export const CSP_PARTNER_ANALYTICS_QUEUE = 'csp-partner-analytics';
export const CSP_PARTNER_ANALYTICS_JOB_NAME = 'record-event';
export const DEMO_TENANT_ORG_ID = '0987654321';

export type CspPartnerAnalyticsRange = '1d' | '7d' | '14d' | '30d';

export interface EnqueueAnalyticsEventInput {
	orgId: string;
	actorId: string;
	eventType: CspPartnerEventType;
	country?: CspPartnerCountry | null;
	startingSkuId?: CspPartnerStartingSkuId | null;
	endingSkuId?: CspPartnerEndingSkuId | null;
	uploadCount?: number | null;
	metadata?: Record<string, unknown>;
}

export interface CspPartnerAnalyticsJobData {
	id: string;
	orgId: string;
	actorId: string;
	eventType: CspPartnerEventType;
	country: CspPartnerCountry | null;
	startingSkuId: CspPartnerStartingSkuId | null;
	endingSkuId: CspPartnerEndingSkuId | null;
	uploadCount: number | null;
	metadata: Record<string, unknown>;
}

export interface CspPartnerAnalyticsFilters {
	range: CspPartnerAnalyticsRange;
	partnerOrgId?: string;
	/**
	 * Empty array or undefined = "All countries". Multiple values = OR filter.
	 */
	countries?: CspPartnerCountry[];
}

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
	countries: CspPartnerCountry[];
}

export interface CspPartnerAnalyticsByCountryRow {
	country: CspPartnerCountry;
	views: number;
	generated: number;
}

export type CspPartnerAnalyticsByCountrySeries =
	CspPartnerAnalyticsByCountryRow[];

export type CspPartnerSkuDimension = 'start' | 'end';

export interface CspPartnerAnalyticsByCountrySkuRow {
	country: CspPartnerCountry;
	count: number;
}

export type CspPartnerAnalyticsByCountrySkuSeries =
	CspPartnerAnalyticsByCountrySkuRow[];

export interface CspPartnerAnalyticsSkuPieGridBox {
	endingSkuId: string;
	label: string;
	total: number;
	startingSkuCounts: Record<string, number>;
}

export type CspPartnerAnalyticsSkuPieGrid =
	CspPartnerAnalyticsSkuPieGridBox[];

export interface CspPartnerAnalyticsSkuTabTotals {
	all: number;
	bySkuId: Record<string, number>;
}

export const CSP_PARTNER_ENDING_SKU_LABELS: Record<string, string> = {
	bs_cb: 'Business Standard + Copilot Business',
	bp_cb: 'Business Premium + Copilot Business',
	bp_cb_purview: 'Business Premium + Copilot Business + Purview Suite',
	bp_defender: 'Business Premium + Defender Suite',
	bp_purview: 'Business Premium + Purview Suite',
	bp_defender_purview: 'Business Premium + Purview Suite + Defender Suite',
};

export const CSP_PARTNER_STARTING_SKU_LABELS: Record<string, string> = {
	bb: 'Business Basic',
	bs: 'Business Standard',
	bp: 'Business Premium',
	other: 'Other',
};

export const CSP_PARTNER_ANALYTICS_RANGE_DAYS: Record<
	CspPartnerAnalyticsRange,
	number
> = {
	'1d': 1,
	'7d': 7,
	'14d': 14,
	'30d': 30,
};

export function resolveRangeWindow(range: CspPartnerAnalyticsRange): {
	from: Date;
	to: Date;
} {
	const to = new Date();
	const from = new Date(to);
	from.setUTCDate(from.getUTCDate() - CSP_PARTNER_ANALYTICS_RANGE_DAYS[range]);
	return { from, to };
}
