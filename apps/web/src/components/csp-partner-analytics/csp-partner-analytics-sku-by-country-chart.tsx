'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from '@/components/ui/chart';
import { formatCount } from '@/components/admin-analytics/admin-analytics-formatters';
import { cn } from '@/lib/utils';
import {
	fetchCspPartnerAnalyticsByCountrySku,
	fetchCspPartnerAnalyticsSkuTabTotals,
	type CspPartnerAnalyticsByCountrySkuRow,
	type CspPartnerAnalyticsFilters,
	type CspPartnerAnalyticsSkuTabTotals,
	type CspPartnerSkuDimension,
} from './csp-partner-analytics-api';

export interface SkuTab {
	id: string;
	label: string;
}

const ALL_TAB: SkuTab = { id: 'all', label: 'All SKUs' };

interface Props {
	title: string;
	dimension: CspPartnerSkuDimension;
	tabs: SkuTab[];
	filters: CspPartnerAnalyticsFilters;
	color: string;
	testId: string;
}

const chartConfig: ChartConfig = {
	count: {
		label: 'Proposals generated',
		color: 'var(--color-blue-600)',
	},
};

export function CspPartnerAnalyticsSkuByCountryChart({
	title,
	dimension,
	tabs,
	filters,
	color,
	testId,
}: Props) {
	const [activeTab, setActiveTab] = useState<string>('all');
	const [rows, setRows] = useState<CspPartnerAnalyticsByCountrySkuRow[]>([]);
	const [tabTotals, setTabTotals] =
		useState<CspPartnerAnalyticsSkuTabTotals | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		Promise.all([
			fetchCspPartnerAnalyticsByCountrySku(filters, dimension, activeTab),
			fetchCspPartnerAnalyticsSkuTabTotals(filters, dimension),
		])
			.then(([data, totals]) => {
				if (cancelled) return;
				setRows(data);
				setTabTotals(totals);
			})
			.catch((err) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : 'Failed to load chart');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [filters, dimension, activeTab]);

	const tabOptions = [ALL_TAB, ...tabs];
	const totalForTab = (id: string): number => {
		if (!tabTotals) return 0;
		return id === 'all' ? tabTotals.all : tabTotals.bySkuId[id] ?? 0;
	};

	return (
		<Card
			data-testid={testId}
			className="overflow-hidden gap-0! border border-transparent bg-white py-0 shadow-[0_0_1.143px_0_rgba(0,0,0,0.40),0_2px_4px_0_rgba(0,0,0,0.04)]"
		>
			<CardHeader className="flex flex-col gap-0 border-b border-stone-100 p-0!">
				<div className="flex w-full items-center justify-between p-4">
					<CardTitle className="text-lg text-stone-950">{title}</CardTitle>
				</div>
				<div
					className={cn(
						'grid w-full bg-stone-50',
						tabOptions.length <= 5 ? 'grid-cols-5' : 'grid-cols-7',
					)}
					role="tablist"
				>
					{tabOptions.map((tab, index) => (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={activeTab === tab.id}
							data-active={activeTab === tab.id}
							data-testid={`${testId}-tab-${tab.id}`}
							onClick={() => setActiveTab(tab.id)}
							className={cn(
								'relative flex flex-1 cursor-pointer flex-col justify-center gap-2 border-stone-50 px-4 py-3 text-left transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300',
								index > 0 ? 'border-l border-stone-200' : '',
								'data-[active=true]:bg-white data-[active=true]:border-b data-[active=true]:border-b-stone-700',
							)}
						>
							<span className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
								{tab.label}
							</span>
							<span className="leading-none font-bold font-mono text-stone-950 text-xl">
								{tabTotals ? formatCount(totalForTab(tab.id)) : '—'}
							</span>
						</button>
					))}
				</div>
			</CardHeader>
			<CardContent className="px-2 pt-6 sm:p-6">
				{error ? (
					<div className="flex h-[260px] items-center justify-center text-sm text-red-600">
						{error}
					</div>
				) : loading ? (
					<div className="flex h-[260px] items-center justify-center text-sm text-stone-400">
						Loading…
					</div>
				) : rows.length === 0 ? (
					<div className="flex h-[260px] items-center justify-center text-sm text-stone-400">
						No activity in this range
					</div>
				) : (
					<ChartContainer
						config={chartConfig}
						className="aspect-auto h-[280px] w-full"
					>
						<BarChart
							accessibilityLayer
							data={rows}
							margin={{ left: -20, right: 0, top: 0, bottom: 10 }}
						>
							<CartesianGrid vertical={false} strokeDasharray="4 4" />
							<YAxis
								type="number"
								allowDecimals={false}
								axisLine={false}
								tickLine={false}
								width={36}
								tickFormatter={(value) => formatCount(Number(value))}
							/>
							<XAxis
								dataKey="country"
								axisLine={false}
								tickLine={false}
								tickMargin={10}
								minTickGap={16}
							/>
							<ChartTooltip
								cursor={false}
								content={<ChartTooltipContent indicator="line" />}
							/>
							<Bar
								dataKey="count"
								name="Proposals generated"
								fill={color}
								maxBarSize={28}
								radius={[4, 4, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
