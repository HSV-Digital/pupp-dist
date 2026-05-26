import type { ColumnMapper, MappedRow } from '../upload.types';
import {
	parseOrgSize,
	parseOrgSizeRange,
	parseRenewalMonthYear,
} from './clas-parsers';

function get(raw: Record<string, string>, key: string): string | undefined {
	const val = raw[key]?.trim();
	return val && val.length > 0 ? val : undefined;
}

export const clasMicrosoftMapper: ColumnMapper = {
	sourceType: 'CLAS_MICROSOFT',

	mapRow(raw: Record<string, string>): MappedRow {
		const renewal = get(raw, 'MW CSP Annual Renewal');
		const orgSize = get(raw, 'Org Size');
		return {
			distributorName: get(raw, 'Distributor Name'),
			partnerName: get(raw, 'Partner Name (Reseller Name)'),
			partnerGlobalId: get(raw, 'Partner Global ID'),
			mpnId: get(raw, 'Partner One ID'),
			customerTpid: get(raw, 'CustomerTPID'),
			accountName: get(raw, 'Account Name'),
			countryName: get(raw, 'Country Name'),
			copilotFit: get(raw, 'Copilot Fit'),
			copilotIntent: get(raw, 'Copilot Intent'),
			copilotCluster: get(raw, 'Copilot Cluster'),
			mwCspAnnualRenewal: renewal,
			mwPaidSeatRange: get(raw, 'MW Paid Seat Range'),
			hasTransactedProduct: get(raw, 'Has Transacted Product'),
			hasCompete: get(raw, 'Has Compete'),
			tenantIds: get(raw, 'TenantIDs'),
			licensesCount: parseOrgSize(orgSize),
			orgSizeRange: parseOrgSizeRange(orgSize),
			subscriptionEndDate: parseRenewalMonthYear(renewal),
		};
	},

	validate(raw: Record<string, string>): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		if (!get(raw, 'Account Name')) {
			errors.push('Account Name is required');
		}
		return { valid: errors.length === 0, errors };
	},
};
