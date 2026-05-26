'use client';

import { AdminAnalyticsKpiStrip } from '@/components/admin-analytics/admin-analytics-kpi-strip';
import type { CspPartnerAnalyticsTileCounts } from './csp-partner-analytics-api';

interface Props {
	data: CspPartnerAnalyticsTileCounts | null;
	loading: boolean;
	countryFilterActive: boolean;
}

const numberFormatter = new Intl.NumberFormat('en-US');

function format(value: number | undefined): string {
	if (typeof value !== 'number') return '—';
	return numberFormatter.format(value);
}

export function CspPartnerAnalyticsTiles({
	data,
	loading,
	countryFilterActive,
}: Props) {
	const items = [
		{
			label: 'Logins',
			value: loading ? '…' : format(data?.logins),
			helper: countryFilterActive
				? 'Not country-attributable'
				: 'Successful logins',
		},
		{
			label: 'Subscription uploads',
			value: loading ? '…' : format(data?.uploads),
			helper: 'Accepted subscription rows',
		},
		{
			label: 'View Proposal clicks',
			value: loading ? '…' : format(data?.views),
			helper: 'Proposal page renders',
		},
		{
			label: 'Proposals generated',
			value: loading ? '…' : format(data?.generated),
			helper: 'Scenarios generated',
		},
	];

	return (
		<AdminAnalyticsKpiStrip
			items={items}
			className="md:grid-cols-2 xl:grid-cols-4"
		/>
	);
}
