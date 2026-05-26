'use client';

import { Label, Pie, PieChart } from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from '@/components/ui/chart';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	formatCompactCount,
	formatCount,
} from '@/components/admin-analytics/admin-analytics-formatters';
import { getStartingSkuColor } from '@/components/admin-analytics/admin-analytics-ending-sku-presenters';
import type { CspPartnerAnalyticsSkuPieGridBox } from './csp-partner-analytics-api';

const START_SKU_LABELS: Record<string, string> = {
	bb: 'Business Basic',
	bs: 'Business Standard',
	bp: 'Business Premium',
	other: 'Other',
};

const START_SKU_ORDER = ['bb', 'bs', 'bp', 'other'];

const chartConfig: ChartConfig = {
	count: { label: 'Proposals generated' },
	...Object.fromEntries(
		START_SKU_ORDER.map((id) => [
			id,
			{ label: START_SKU_LABELS[id] ?? id, color: getStartingSkuColor(id) },
		]),
	),
};

interface Props {
	data: CspPartnerAnalyticsSkuPieGridBox[];
	loading: boolean;
}

interface BoxProps {
	box: CspPartnerAnalyticsSkuPieGridBox;
}

function PieBox({ box }: BoxProps) {
	const rows = START_SKU_ORDER.map((id) => ({
		startingSkuId: id,
		label: START_SKU_LABELS[id] ?? id,
		count: box.startingSkuCounts[id] ?? 0,
		color: getStartingSkuColor(id),
	}));
	const pieData = rows
		.filter((row) => row.count > 0)
		.map((row) => ({ ...row, fill: row.color }));

	return (
		<Card
			data-testid={`csp-partner-analytics-sku-pie-card-${box.endingSkuId}`}
			className="p-0! gap-0! border border-transparent shadow-[0_0_1.143px_0_rgba(0,0,0,0.40),0_2px_4px_0_rgba(0,0,0,0.04)]"
		>
			<CardHeader className="p-4! pb-2! m-0! gap-0 bg-white rounded-t-xl">
				<p className="text-lg leading-snug font-medium text-stone-950">
					{box.label}
				</p>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-1 p-0">
				<div className="bg-white rounded-b-xl">
					{pieData.length > 0 ? (
						<ChartContainer
							config={chartConfig}
							className="mx-auto aspect-square h-[200px] max-h-[200px]"
						>
							<PieChart>
								<ChartTooltip
									cursor={false}
									content={
										<ChartTooltipContent
											hideLabel
											indicator="line"
											className="w-48"
											nameKey="label"
										/>
									}
								/>
								<Pie
									data={pieData}
									dataKey="count"
									nameKey="label"
									innerRadius={64}
									outerRadius={80}
									paddingAngle={2}
									strokeWidth={4}
								>
									<Label
										content={({ viewBox }) => {
											if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
												return (
													<text
														x={viewBox.cx}
														y={viewBox.cy}
														textAnchor="middle"
														dominantBaseline="middle"
													>
														<tspan
															x={viewBox.cx}
															y={viewBox.cy}
															className="fill-foreground text-3xl font-bold font-mono"
														>
															{formatCompactCount(box.total)}
														</tspan>
													</text>
												);
											}
										}}
									/>
								</Pie>
							</PieChart>
						</ChartContainer>
					) : (
						<div
							data-testid={`csp-partner-analytics-sku-pie-empty-${box.endingSkuId}`}
							className="mx-auto flex my-5 p-2 aspect-square h-[160px] max-h-[160px] w-full max-w-[160px] items-center justify-center rounded-full border border-dashed border-stone-200 bg-stone-50/80 text-center"
						>
							<div className="space-y-1">
								<p className="text-sm font-medium text-stone-700">
									No activity
								</p>
								<p className="text-xs text-stone-500">
									No start-SKU counts in this range.
								</p>
							</div>
						</div>
					)}
				</div>
				<div className="overflow-hidden rounded-lg bg-white">
					<div className="w-[94%] mx-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Start SKU</TableHead>
									<TableHead className="text-right">Count</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow
										key={`${box.endingSkuId}:${row.startingSkuId}`}
									>
										<TableCell className="font-medium text-stone-700">
											<div className="flex items-center gap-3">
												<span
													aria-hidden="true"
													className="h-3 w-1 rounded-md"
													style={{ backgroundColor: row.color }}
												/>
												<span>{row.label}</span>
											</div>
										</TableCell>
										<TableCell className="text-right font-semibold font-mono text-stone-950">
											{formatCount(row.count)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function CspPartnerAnalyticsSkuPieGrid({ data, loading }: Props) {
	if (loading && data.length === 0) {
		return (
			<div
				className="flex h-[260px] items-center justify-center rounded-2xl border border-transparent bg-white text-sm text-stone-400 shadow-[0_0_1.143px_0_rgba(0,0,0,0.40),0_2px_4px_0_rgba(0,0,0,0.04)]"
				data-testid="csp-partner-analytics-sku-pie-grid-loading"
			>
				Loading…
			</div>
		);
	}

	return (
		<div
			data-testid="csp-partner-analytics-sku-pie-grid"
			className="grid gap-2 grid-cols-3"
		>
			{data.map((box) => (
				<PieBox key={box.endingSkuId} box={box} />
			))}
		</div>
	);
}
