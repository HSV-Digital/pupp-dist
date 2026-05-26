'use client';

import { cn } from '@/lib/utils';

export interface AdminAnalyticsKpiStripItem {
	label: string;
	value: string;
	helper?: string;
}

export function AdminAnalyticsKpiStrip({
	items,
	className,
}: {
	items: AdminAnalyticsKpiStripItem[];
	className?: string;
}) {
	return (
		<div
			className={cn(
				'grid gap-px p-0! border border-transparent overflow-hidden rounded-2xl shadow-[0_0_1.143px_0_rgba(0,0,0,0.40),0_2px_4px_0_rgba(0,0,0,0.04)]',
				className,
			)}
		>
			{items.map((item) => (
				<div
					key={item.label}
					className="bg-white px-4 py-4"
					data-slot="admin-analytics-kpi-tile"
				>
					<p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
						{item.label}
					</p>
					<div className="mt-2 font-mono text-xl font-semibold text-stone-950">
						{item.value}
					</div>
					{item.helper ? (
						<p className="mt-2 text-xs leading-5 text-stone-500">
							{item.helper}
						</p>
					) : null}
				</div>
			))}
		</div>
	);
}
