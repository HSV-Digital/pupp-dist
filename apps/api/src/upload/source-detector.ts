import type { SourceType } from './upload.types';

interface SourceSignature {
	sourceType: SourceType;
	requiredColumns: string[];
}

const SOURCE_SIGNATURES: SourceSignature[] = [
	{
		sourceType: 'RENEWAL_MICROSOFT',
		requiredColumns: [
			'Distributor Name (From)',
			'Reseller Name (From)',
			'TPID',
			'Customer Name',
			'Expiration Ending Product',
			'Expiration Ending Seats',
			'Subscription End Date',
			'Type',
			'Distributor ID (From)',
		],
	},
	{
		sourceType: 'RENEWAL_PARTNER',
		requiredColumns: [
			'PGAMpnId',
			'MpnId',
			'CustomerName',
			'SubscriptionName',
			'LicensesCount',
			'SubscriptionEndDate',
		],
	},
	{
		sourceType: 'CLAS_MICROSOFT',
		requiredColumns: [
			'Distributor Name',
			'Partner Name (Reseller Name)',
			'Partner Global ID',
			'Partner One ID',
			'CustomerTPID',
			'Account Name',
			'Copilot Fit',
			'Copilot Intent',
			'Copilot Cluster',
			'TenantIDs',
		],
	},
	{
		sourceType: 'CLAS_PARTNER',
		requiredColumns: [
			'PartnerName',
			'GlobalID',
			'CustomerID',
			'AccountName',
			'Country',
			'M365_CoPilot_Fit',
			'M365_CoPilot_Intent',
			'M365_CoPilot_Cluster',
			'Has_MW_CSP_Annual_Renewal',
		],
	},
	{
		sourceType: 'CUSTOM',
		requiredColumns: ['Customer Name', 'Country Name'],
	},
];

export function detectSourceType(headers: string[]): SourceType | null {
	const normalizedHeaders = new Set(
		headers.map((h) => h.trim().toLowerCase()),
	);

	for (const signature of SOURCE_SIGNATURES) {
		const allPresent = signature.requiredColumns.every((col) =>
			normalizedHeaders.has(col.toLowerCase()),
		);
		if (allPresent) {
			return signature.sourceType;
		}
	}

	return null;
}
