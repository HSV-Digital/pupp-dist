'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from '@/components/ui/chart';
import { formatCount } from '@/components/admin-analytics/admin-analytics-formatters';
import type { CspPartnerAnalyticsByCountryRow } from './csp-partner-analytics-api';

const chartConfig: ChartConfig = {
	views: {
		label: 'Viewed',
		color: 'var(--color-blue-400)',
	},
	generated: {
		label: 'Generated',
		color: 'var(--color-blue-800)',
	},
};

interface Props {
	data: CspPartnerAnalyticsByCountryRow[];
	loading: boolean;
}

export function CspPartnerAnalyticsByCountryChart({ data, loading }: Props) {
	return (
		<Card
			data-testid="csp-partner-analytics-by-country-chart"
			className="overflow-hidden gap-0! border border-transparent bg-white py-0 shadow-[0_0_1.143px_0_rgba(0,0,0,0.40),0_2px_4px_0_rgba(0,0,0,0.04)]"
		>
			<CardHeader className="border-b border-stone-100 p-4 pb-4!">
				<CardTitle className="text-lg text-stone-950">
					Viewed vs Generated (by country)
				</CardTitle>
			</CardHeader>
			<CardContent className="px-2 pt-6 sm:p-6">
				{loading ? (
					<div className="flex h-[300px] items-center justify-center text-sm text-stone-400">
						Loading…
					</div>
				) : data.length === 0 ? (
					<div className="flex h-[300px] items-center justify-center text-sm text-stone-400">
						No activity in this range
					</div>
				) : (
					<ChartContainer
						config={chartConfig}
						className="aspect-auto h-[320px] w-full"
					>
						<BarChart
							accessibilityLayer
							data={data}
							barGap={6}
							barSize={28}
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
								dataKey="views"
								name="Viewed"
								fill="var(--color-views)"
								radius={[4, 4, 0, 0]}
							/>
							<Bar
								dataKey="generated"
								name="Generated"
								fill="var(--color-generated)"
								radius={[4, 4, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
