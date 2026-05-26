import type { AdminAnalyticsEndingSkuOverviewResponse } from '@repo/types';
import { formatEndingSkuShortLabel } from './admin-analytics-formatters';

const DEFAULT_STARTING_SKU_COLOR = 'var(--chart-5)';

export const STARTING_SKU_CHART_COLORS: Record<string, string> = {
	bb: 'var(--color-blue-400)',
	bs: 'var(--color-blue-600)',
	bp: 'var(--color-blue-800)',
	other: 'var(--color-blue-200)',
};

export interface AdminAnalyticsEndingSkuPieCardRow {
	startingSkuId: string;
	label: string;
	count: number;
	color: string;
}

export interface AdminAnalyticsEndingSkuPieCardDatum {
	endingSkuId: string;
	endingSkuLabel: string;
	endingSkuShortLabel: string;
	total: number;
	rows: AdminAnalyticsEndingSkuPieCardRow[];
	pieData: Array<AdminAnalyticsEndingSkuPieCardRow & { fill: string }>;
}

export function getStartingSkuColor(startingSkuId: string): string {
	return STARTING_SKU_CHART_COLORS[startingSkuId] ?? DEFAULT_STARTING_SKU_COLOR;
}

export function getEndingSkuPieCardData(
	data: AdminAnalyticsEndingSkuOverviewResponse,
): AdminAnalyticsEndingSkuPieCardDatum[] {
	return data.endingSkus.map((endingSku) => {
		const countsByStartingSku = Object.fromEntries(
			data.startingSkus.map((startingSku) => [startingSku.id, 0]),
		) as Record<string, number>;

		for (const point of data.series) {
			const pointCounts =
				point.countsByEndingSkuAndStartingSku[endingSku.id] ?? {};

			for (const startingSku of data.startingSkus) {
				countsByStartingSku[startingSku.id] += pointCounts[startingSku.id] ?? 0;
			}
		}

		const rows = data.startingSkus.map((startingSku) => ({
			startingSkuId: startingSku.id,
			label: startingSku.label,
			count: countsByStartingSku[startingSku.id] ?? 0,
			color: getStartingSkuColor(startingSku.id),
		}));
		const total = rows.reduce((sum, row) => sum + row.count, 0);

		return {
			endingSkuId: endingSku.id,
			endingSkuLabel: endingSku.label,
			endingSkuShortLabel: formatEndingSkuShortLabel(endingSku.id),
			total,
			rows,
			pieData: rows
				.filter((row) => row.count > 0)
				.map((row) => ({
					...row,
					fill: row.color,
				})),
		};
	});
}
