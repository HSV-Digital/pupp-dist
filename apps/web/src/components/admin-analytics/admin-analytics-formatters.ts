import type {
	AdminAnalyticsActivityBucketSize,
	AdminAnalyticsEndingSkuOverviewResponse,
	AdminAnalyticsMetricCounts,
	AdminAnalyticsSeriesPoint,
	AdminAnalyticsUserViewResponse,
} from '@repo/types';
import {
	ADMIN_ANALYTICS_METRICS,
	type AdminAnalyticsMetricKey,
} from './admin-analytics-metrics';

const ENDING_SKU_SHORT_LABEL_PARTS: Record<string, string> = {
	bs: 'BS',
	bp: 'BP',
	cb: 'Copilot',
	purview: 'Purview',
	defender: 'Defender',
};

export const ADMIN_ANALYTICS_ENDING_SKU_OVERALL_KEY = 'overall';

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
	notation: 'compact',
	maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const dayFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
});

const lastLoginFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
});

interface ActivityBucketLabelOptions {
	timeZone?: string;
}

const activityHourRoundingFormatterCache = new Map<string, Intl.DateTimeFormat>();
const activityHourTooltipFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function formatCompactCount(value: number): string {
	return compactNumberFormatter.format(value);
}

export function formatCount(value: number): string {
	return numberFormatter.format(value);
}

export function formatPercentage(value: number): string {
	if (!Number.isFinite(value)) {
		return '0%';
	}

	return `${Math.round((value + Number.EPSILON) * 10) / 10}%`;
}

export function formatSeriesDay(value: string): string {
	return dayFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export function formatActivityBucketLabel(
	value: string,
	bucketSize: AdminAnalyticsActivityBucketSize,
	format: 'axis' | 'tooltip' = 'axis',
	options?: ActivityBucketLabelOptions,
): string {
	const date = new Date(value);
	if (bucketSize === 'hour') {
		const timeZone = options?.timeZone;
		if (format === 'axis') {
			return formatRoundedActivityAxisHourLabel(date, timeZone);
		}

		return formatRoundedActivityTooltipLabel(date, timeZone);
	}

	return dayFormatter.format(date);
}

export function formatLastLogin(value: string | null): string {
	if (!value) {
		return 'Never';
	}

	return lastLoginFormatter.format(new Date(value));
}

export function formatDurationSeconds(value: number): string {
	if (!Number.isFinite(value) || value <= 0) {
		return '0s';
	}

	const rounded = Math.round(value);
	const minutes = Math.floor(rounded / 60);
	const seconds = rounded % 60;
	if (minutes <= 0) {
		return `${seconds}s`;
	}

	if (seconds === 0) {
		return `${minutes}m`;
	}

	return `${minutes}m ${seconds}s`;
}

export function formatDecimalValue(value: number): string {
	if (!Number.isFinite(value)) {
		return '0';
	}

	return `${Math.round(value * 10) / 10}`;
}

export function getSeriesTotals(
	series: AdminAnalyticsSeriesPoint[],
): AdminAnalyticsMetricCounts {
	return series.reduce<AdminAnalyticsMetricCounts>(
		(accumulator, point) => {
			for (const metric of ADMIN_ANALYTICS_METRICS) {
				accumulator[metric.key] += point[metric.key];
			}

			return accumulator;
		},
		{
			resellerListDownloads: 0,
			customerListDownloads: 0,
			opportunityListEmails: 0,
			proposalOptionsPartnerEmails: 0,
			proposalsGenerated: 0,
			proposalDocumentsDownloaded: 0,
		},
	);
}

export function hasAnyActivity(data: AdminAnalyticsUserViewResponse): boolean {
	return ADMIN_ANALYTICS_METRICS.some((metric) =>
		data.series.some((point) => point[metric.key] > 0),
	);
}

export function formatEndingSkuShortLabel(endingSkuId: string): string {
	return endingSkuId
		.split('_')
		.map((part) => ENDING_SKU_SHORT_LABEL_PARTS[part] ?? part.toUpperCase())
		.join(' + ');
}

export function getEndingSkuSeriesTotals(
	data: AdminAnalyticsEndingSkuOverviewResponse,
): Record<string, number> {
	const totals: Record<string, number> = {
		[ADMIN_ANALYTICS_ENDING_SKU_OVERALL_KEY]: 0,
	};

	for (const endingSku of data.endingSkus) {
		totals[endingSku.id] = 0;
	}

	for (const point of data.series) {
		totals[ADMIN_ANALYTICS_ENDING_SKU_OVERALL_KEY] +=
			point.proposalsGeneratedOverall;
		for (const endingSku of data.endingSkus) {
			totals[endingSku.id] += point.countsByEndingSku[endingSku.id] ?? 0;
		}
	}

	return totals;
}

export function getMetricValue(
	row: AdminAnalyticsMetricCounts,
	metricKey: AdminAnalyticsMetricKey,
): number {
	return row[metricKey];
}

function formatRoundedActivityAxisHourLabel(
	date: Date,
	timeZone?: string,
): string {
	const formatter = getActivityHourRoundingFormatter(timeZone);
	const parts = formatter.formatToParts(date);
	const hour = Number.parseInt(
		parts.find((part) => part.type === 'hour')?.value ?? '0',
		10,
	);
	const minute = Number.parseInt(
		parts.find((part) => part.type === 'minute')?.value ?? '0',
		10,
	);
	const roundedHour = (hour + (minute >= 30 ? 1 : 0)) % 24;

	return `${roundedHour}`.padStart(2, '0');
}

function formatRoundedActivityTooltipLabel(
	date: Date,
	timeZone?: string,
): string {
	const roundedDate = new Date(date.getTime() + 30 * 60 * 1000);

	return getActivityHourTooltipFormatter(timeZone).format(roundedDate);
}

function getActivityHourRoundingFormatter(
	timeZone?: string,
): Intl.DateTimeFormat {
	const cacheKey = timeZone ?? 'local';
	const cachedFormatter = activityHourRoundingFormatterCache.get(cacheKey);
	if (cachedFormatter) {
		return cachedFormatter;
	}

	const formatter = new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		hour12: false,
		minute: '2-digit',
		...(timeZone ? { timeZone } : {}),
	});
	activityHourRoundingFormatterCache.set(cacheKey, formatter);
	return formatter;
}

function getActivityHourTooltipFormatter(
	timeZone?: string,
): Intl.DateTimeFormat {
	const cacheKey = timeZone ?? 'local';
	const cachedFormatter = activityHourTooltipFormatterCache.get(cacheKey);
	if (cachedFormatter) {
		return cachedFormatter;
	}

	const formatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		hour12: false,
		...(timeZone ? { timeZone } : {}),
	});
	activityHourTooltipFormatterCache.set(cacheKey, formatter);
	return formatter;
}
