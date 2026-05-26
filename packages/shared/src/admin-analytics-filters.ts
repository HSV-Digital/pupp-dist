export const ADMIN_ANALYTICS_UNKNOWN_FILTER_VALUE = '__unknown__';
export const ADMIN_ANALYTICS_UNKNOWN_FILTER_LABEL = 'Unknown';
export const ADMIN_ANALYTICS_OTHER_BREAKDOWN_VALUE = '__other__';
export const ADMIN_ANALYTICS_OTHER_BREAKDOWN_LABEL = 'Other';
export const ADMIN_ANALYTICS_RESELLER_BREAKDOWN_LIMIT = 15;

export const ADMIN_ANALYTICS_FILTER_DEFINITIONS = [
	{ key: 'region', label: 'Region' },
	{ key: 'distributor', label: 'Distributor' },
	{ key: 'reseller', label: 'Reseller' },
	{ key: 'pssAIWorkforce', label: 'PSS (AI Workforce)' },
	{ key: 'pssAISecurity', label: 'PSS (AI Security)' },
	{ key: 'pdm', label: 'PDM' },
	{ key: 'pmm', label: 'PMM' },
	{ key: 'subscriptionType', label: 'Subscription Type' },
	{ key: 'expiringSeats', label: 'Expiring Seats' },
] as const;

export const ADMIN_ANALYTICS_EXPIRING_SEAT_BUCKETS = [
	{
		id: 'lt_50',
		label: '<50',
		minInclusive: null,
		maxInclusive: 49,
	},
	{
		id: '50_100',
		label: '50-100',
		minInclusive: 50,
		maxInclusive: 100,
	},
	{
		id: '100_150',
		label: '100-150',
		minInclusive: 101,
		maxInclusive: 150,
	},
	{
		id: 'gt_150',
		label: '>150',
		minInclusive: 151,
		maxInclusive: null,
	},
] as const;

export function resolveAdminAnalyticsExpiringSeatBucketId(
	expiringSeatCount: number | null | undefined,
): string {
	if (!Number.isFinite(expiringSeatCount) || (expiringSeatCount ?? 0) < 0) {
		return ADMIN_ANALYTICS_UNKNOWN_FILTER_VALUE;
	}

	if ((expiringSeatCount ?? 0) < 50) {
		return 'lt_50';
	}

	if ((expiringSeatCount ?? 0) <= 100) {
		return '50_100';
	}

	if ((expiringSeatCount ?? 0) <= 150) {
		return '100_150';
	}

	return 'gt_150';
}

export function resolveAdminAnalyticsExpiringSeatBucketLabel(
	bucketId: string,
): string {
	return (
		ADMIN_ANALYTICS_EXPIRING_SEAT_BUCKETS.find((bucket) => bucket.id === bucketId)
			?.label ??
		(bucketId === ADMIN_ANALYTICS_UNKNOWN_FILTER_VALUE
			? ADMIN_ANALYTICS_UNKNOWN_FILTER_LABEL
			: bucketId)
	);
}
