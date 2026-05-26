import {
	SkuCategory,
	SeatRange,
	type FilterState,
	type RenewalSubscription,
} from '@repo/types';

export interface SmartFilterBucket {
	/** English label, also doubles as the filter-state identifier. */
	label: string;
	/** Optional dotted i18n key resolving to the localized bucket label. */
	labelKey?: string;
	predicate: (row: RenewalSubscription) => boolean;
}

export interface SmartFilterDimension {
	key: keyof FilterState;
	/** English heading, used as a fallback when no labelKey is provided. */
	label: string;
	/** Optional dotted i18n key resolving to the localized dimension heading. */
	labelKey?: string;
	buckets: SmartFilterBucket[];
}

export const DROPDOWN_FILTER_FIELD_MAP: Partial<
	Record<keyof FilterState, keyof RenewalSubscription>
> = {
	pssAIWorkforce: 'pssAIWorkforceName',
	pssAISecurity: 'pssAISecurityName',
	psa: 'psaName',
	distributor: 'distributorName',
	reseller: 'resellerName',
	customer: 'customerName',
	pdm: 'pdmName',
	pmm: 'pmmName',
	region: 'region',
	type: 'type',
};

export const DROPDOWN_FILTER_KEYS = Object.keys(
	DROPDOWN_FILTER_FIELD_MAP,
) as (keyof FilterState)[];

export function daysUntilRenewal(
	renewalDateStr: string,
	today: Date = new Date(),
): number {
	const now = new Date(today);
	now.setHours(0, 0, 0, 0);
	const renewal = new Date(renewalDateStr);
	renewal.setHours(0, 0, 0, 0);
	return Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export const SMART_FILTER_CONFIG: SmartFilterDimension[] = [
	{
		key: 'skuCategory',
		label: 'SKU',
		buckets: [
			{
				label: 'Business Basic',
				predicate: (r) => r.skuCategory === SkuCategory.Basic,
			},
			{
				label: 'Business Standard',
				predicate: (r) => r.skuCategory === SkuCategory.Standard,
			},
			{
				label: 'Business Premium',
				predicate: (r) => r.skuCategory === SkuCategory.Premium,
			},
		],
	},
	{
		key: 'expSeats',
		label: 'Expiring Seats',
		labelKey: 'renewals.expiringSeats',
		buckets: [
			{
				label: SeatRange.Seats1To24,
				predicate: (r) => r.seatCount >= 1 && r.seatCount <= 24,
			},
			{
				label: SeatRange.Seats25To49,
				predicate: (r) => r.seatCount >= 25 && r.seatCount <= 49,
			},
			{
				label: SeatRange.Seats50To99,
				predicate: (r) => r.seatCount >= 50 && r.seatCount <= 99,
			},
			{
				label: SeatRange.Seats100To299,
				predicate: (r) => r.seatCount >= 100 && r.seatCount <= 299,
			},
			{
				label: SeatRange.Seats300To499,
				predicate: (r) => r.seatCount >= 300 && r.seatCount <= 499,
			},
			{
				label: SeatRange.Seats500To999,
				predicate: (r) => r.seatCount >= 500 && r.seatCount <= 999,
			},
			{
				label: SeatRange.Seats1000Plus,
				predicate: (r) => r.seatCount >= 1000,
			},
		],
	},
	{
		key: 'renewalDate',
		label: 'Upcoming Renewals',
		labelKey: 'renewals.upcomingRenewals',
		buckets: [
			{
				label: 'Within 7 days',
				labelKey: 'filters.within7Days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= 0 && d <= 7;
				},
			},
			{
				label: 'Within 14 days',
				labelKey: 'filters.within14Days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= 0 && d <= 14;
				},
			},
			{
				label: 'Within 30 days',
				labelKey: 'filters.within30Days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= 0 && d <= 30;
				},
			},
			{
				label: 'Within 60 days',
				labelKey: 'filters.within60Days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= 0 && d <= 60;
				},
			},
			{
				label: 'Above 60 days',
				labelKey: 'filters.above60Days',
				predicate: (r) => daysUntilRenewal(r.renewalDate) > 60,
			},
		],
	},
	{
		key: 'pastRenewalDate',
		label: 'Past Renewals',
		labelKey: 'renewals.pastRenewals',
		buckets: [
			{
				label: 'Within 7 days',
				labelKey: 'filters.within7Days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= -7 && d < 0;
				},
			},
			{
				label: 'Within 14 days',
				labelKey: 'filters.within14Days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= -14 && d < 0;
				},
			},
			{
				label: 'Within 30 days',
				labelKey: 'filters.within30Days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= -30 && d < 0;
				},
			},
			{
				label: 'Within 60 days',
				labelKey: 'filters.within60Days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= -60 && d < 0;
				},
			},
			{
				label: 'Above 60 days',
				labelKey: 'filters.above60Days',
				predicate: (r) => daysUntilRenewal(r.renewalDate) < -60,
			},
		],
	},
];

const SMART_FILTER_KEYS = SMART_FILTER_CONFIG.map((c) => c.key);

const ALL_FILTER_KEYS = [
	...DROPDOWN_FILTER_KEYS,
	...SMART_FILTER_KEYS,
] as (keyof FilterState)[];

function applyOtherFilters(
	data: RenewalSubscription[],
	filters: FilterState,
	excludeKey: keyof FilterState,
): RenewalSubscription[] {
	let filtered = data;

	for (const key of ALL_FILTER_KEYS) {
		if (key === excludeKey) continue;
		const values = filters[key];
		if (values.length === 0) continue;

		// Check if this is a dropdown or smart dimension
		const dropdownField = DROPDOWN_FILTER_FIELD_MAP[key];
		if (dropdownField) {
			filtered = filtered.filter((row) => {
				const val = row[dropdownField] as string;
				return val != null && values.includes(val);
			});
		} else {
			const smartDim = SMART_FILTER_CONFIG.find((c) => c.key === key);
			if (smartDim) {
				const activeBuckets = smartDim.buckets.filter((b) =>
					values.includes(b.label),
				);
				// OR within dimension: row matches if it matches any selected bucket
				filtered = filtered.filter((row) =>
					activeBuckets.some((b) => b.predicate(row)),
				);
			}
		}
	}

	return filtered;
}

/**
 * Compute available options for each filter dimension using cross-filtering.
 * For each dimension, all OTHER filters are applied (not its own), then
 * unique values / bucket labels are extracted.
 */
export function getAvailableOptions(
	data: RenewalSubscription[],
	filters: FilterState,
): Record<keyof FilterState, string[]> {
	const result = {} as Record<keyof FilterState, string[]>;

	// Dropdown dimensions: extract unique field values
	for (const key of DROPDOWN_FILTER_KEYS) {
		const filtered = applyOtherFilters(data, filters, key);
		const field = DROPDOWN_FILTER_FIELD_MAP[key]!;
		const unique = [
			...new Set(
				filtered
					.map((row) => row[field] as string)
					.filter((v) => v != null && v !== ''),
			),
		];
		unique.sort();
		result[key] = unique;
	}

	// Smart dimensions: return bucket labels that have at least one matching row
	for (const dim of SMART_FILTER_CONFIG) {
		const filtered = applyOtherFilters(data, filters, dim.key);
		result[dim.key] = dim.buckets
			.filter((bucket) => filtered.some((row) => bucket.predicate(row)))
			.map((bucket) => bucket.label);
	}

	return result;
}
