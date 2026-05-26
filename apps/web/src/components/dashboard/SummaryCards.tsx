import {
	CalendarLtr24Regular,
	People24Regular,
	Rocket24Regular,
} from '@fluentui/react-icons';
import { useTranslations } from 'next-intl';
import { formatEstimatedSeatCount } from '@repo/shared';
import type { DashboardSummary } from '@repo/types';
import { formatNumber } from '@/lib/format-utils';

interface SummaryCardsProps {
	summary: DashboardSummary;
	customerCount: number;
	className?: string;
	isLoading?: boolean;
}

export function SummaryCards({
	summary,
	customerCount,
	className,
	isLoading = false,
}: SummaryCardsProps) {
	const t = useTranslations();
	const cards = [
		{
			label: t('dashboard.totalCustomers'),
			icon: <CalendarLtr24Regular />,
			value: formatNumber(customerCount),
		},
		{
			label: t('dashboard.totalSubscriptions'),
			icon: <Rocket24Regular />,
			value: formatNumber(summary.totalRenewals),
		},
		{
			label: t('table.totalSeatsEstimated'),
			icon: <People24Regular />,
			value:
				summary.totalSeatsDisplay ??
				formatEstimatedSeatCount(summary.totalSeats),
		},
	];

	return (
		<div
			className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 pb-4 ${className ?? ''}`}
		>
			{cards.map((card) => (
				<div
					key={card.label}
					className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 max-2xl:px-3 max-2xl:py-3"
				>
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-(--ds-color-violet-50) text-(--ds-color-violet-500)">
						{card.icon}
					</div>
					<div>
						<p className="m-0 font-ds-text text-[0.8125rem] leading-4.5 text-gray-500">
							{card.label}
						</p>
						{isLoading ? (
							<div className="mt-1 h-5 w-16 animate-pulse rounded bg-gray-200" />
						) : (
							<p className="mb-0 mt-0.5 font-ds-display text-lg max-2xl:text-base font-mono font-semibold leading-7">
								{card.value}
							</p>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
