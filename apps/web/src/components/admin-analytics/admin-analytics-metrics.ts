import type { AdminAnalyticsMetricCounts, AnalyticsRange } from '@repo/types';

export type AdminAnalyticsMetricKey = keyof AdminAnalyticsMetricCounts;

export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = '7d';

export const ANALYTICS_RANGE_OPTIONS: ReadonlyArray<{
	label: string;
	value: AnalyticsRange;
}> = [
	{ label: '1D', value: '1d' },
	{ label: '7D', value: '7d' },
	{ label: '14D', value: '14d' },
	{ label: '30D', value: '30d' },
];

export const ADMIN_ANALYTICS_METRICS: ReadonlyArray<{
	key: AdminAnalyticsMetricKey;
	label: string;
	shortLabel: string;
	color: string;
}> = [
	{
		key: 'resellerListDownloads',
		label: 'Reseller list downloads',
		shortLabel: 'Reseller lists',
		color: 'ds-color-info-700',
	},
	{
		key: 'customerListDownloads',
		label: 'Customer list downloads',
		shortLabel: 'Customer lists',
		color: 'ds-color-info-600',
	},
	{
		key: 'opportunityListEmails',
		label: 'Download e-mail to send the list to partner',
		shortLabel: 'List e-mails',
		color: 'ds-color-info-500',
	},
	{
		key: 'proposalOptionsPartnerEmails',
		label: 'E-mail to send proposal options to partner',
		shortLabel: 'Proposal option e-mails',
		color: 'ds-color-info-400',
	},
	{
		key: 'proposalsGenerated',
		label: 'Proposals generated',
		shortLabel: 'Generated',
		color: 'ds-color-info-300',
	},
	{
		key: 'proposalDocumentsDownloaded',
		label: 'Proposal documents downloaded',
		shortLabel: 'Documents downloaded',
		color: 'ds-color-info-200',
	},
] as const;
