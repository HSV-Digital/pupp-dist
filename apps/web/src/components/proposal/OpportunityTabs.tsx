'use client';

import { Fragment, useMemo } from 'react';
import { toSeatRange } from '@repo/shared';
import { Tab, TabList } from '@fluentui/react-components';
import { useTranslations } from 'next-intl';
import type { CustomerOpportunity } from '@/lib/opportunity-utils';
import { formatMonthYear } from '@/lib/format-utils';
import { daysUntilRenewal } from '@/lib/filter-utils';

interface OpportunityTabsProps {
	opportunities: CustomerOpportunity[];
	activeOpportunityId: string | null;
	onChange: (opportunityId: string) => void;
}

export function OpportunityTabs({
	opportunities,
	activeOpportunityId,
	onChange,
}: OpportunityTabsProps) {
	const t = useTranslations('renewals');
	const { upcoming, past } = useMemo(() => {
		const today = new Date();
		const up: CustomerOpportunity[] = [];
		const pa: CustomerOpportunity[] = [];
		for (const o of opportunities) {
			// Skip zero-seat placeholder rows (e.g. new-customer records with no
			// live subscription). Subscriptions with a blank product name are still
			// surfaced — they resolve to the generic upgrade path and must remain
			// selectable so their proposal options can be generated.
			if (Math.floor(o.subscription.seatCount) <= 0) continue;
			if (daysUntilRenewal(o.subscription.renewalDate, today) >= 0) {
				up.push(o);
			} else {
				pa.push(o);
			}
		}
		up.sort((a, b) =>
			a.subscription.renewalDate.localeCompare(b.subscription.renewalDate),
		);
		pa.sort((a, b) =>
			b.subscription.renewalDate.localeCompare(a.subscription.renewalDate),
		);
		return { upcoming: up, past: pa };
	}, [opportunities]);

	const selectedValue =
		activeOpportunityId ??
		upcoming[0]?.opportunityId ??
		past[0]?.opportunityId ??
		'';

	let counter = 0;

	const renderTab = (opportunity: CustomerOpportunity, isLast: boolean) => {
		const idx = counter++;
		const isActive = opportunity.opportunityId === selectedValue;
		return (
			<Fragment key={opportunity.opportunityId}>
				<Tab
					value={opportunity.opportunityId}
					className={`rounded-lg border w-full! py-3 px-4 text-left transition-colors ${
						isActive
							? 'border-(--ds-color-violet-300) bg-(--ds-color-violet-50)'
							: 'border-transparent hover:border-gray-200 hover:bg-gray-50'
					}`}
				>
					<div className="flex flex-col gap-1 w-full">
						<p
							className={`mb-0.5 line-clamp-2 text-sm leading-5 ${isActive ? 'font-semibold text-(--ds-color-violet-600)' : 'font-medium text-(--ds-color-violet-900)'}`}
						>
							{opportunity.subscription.currentProduct?.trim() ||
							opportunity.startingSku.name}
						</p>
						<p className="flex flex-wrap items-center gap-1 text-[11px] font-mono text-gray-700 leading-4">
							<span>Seats</span>
							<span>
								{opportunity.subscription.seatRange ??
									toSeatRange(opportunity.subscription.seatCount)}
							</span>
							<span>·</span>
							<span>
								{opportunity.subscription.closestRenewalLabel ??
									formatMonthYear(opportunity.subscription.renewalDate)}
							</span>
						</p>
						<p className="absolute top-0 right-4 font-mono text-2xl text-gray-200">
							{idx + 1}
						</p>
					</div>
				</Tab>
				{!isLast && <div className="mx-3 border-t border-gray-200" />}
			</Fragment>
		);
	};

	return (
		<TabList
			vertical
			selectedValue={selectedValue}
			onTabSelect={(_, data) => onChange(String(data.value))}
			className="flex flex-col gap-1 w-full"
		>
			{upcoming.length > 0 && (
				<>
					<p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600 m-0">
						{t('upcomingRenewals')}
					</p>
					{upcoming.map((o, i) => renderTab(o, i === upcoming.length - 1))}
				</>
			)}
			{past.length > 0 && (
				<>
					<p
						className={`px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 m-0 ${upcoming.length === 0 ? 'pt-2' : 'pt-8'}`}
					>
						{t('pastRenewals')}
					</p>
					{past.map((o, i) => renderTab(o, i === past.length - 1))}
				</>
			)}
		</TabList>
	);
}
