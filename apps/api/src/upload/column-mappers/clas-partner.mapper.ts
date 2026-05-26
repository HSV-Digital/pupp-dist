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

export const clasPartnerMapper: ColumnMapper = {
	sourceType: 'CLAS_PARTNER',

	mapRow(raw: Record<string, string>): MappedRow {
		const renewal = get(raw, 'MW CSP Annual Renewal');
		const orgSize = get(raw, 'Org Size');
		return {
			partnerName: get(raw, 'PartnerName'),
			partnerGlobalId: get(raw, 'GlobalID'),
			customerTpid: get(raw, 'CustomerID'),
			accountName: get(raw, 'AccountName'),
			countryName: get(raw, 'Country'),
			copilotFit: get(raw, 'M365_CoPilot_Fit'),
			copilotIntent: get(raw, 'M365_CoPilot_Intent'),
			copilotCluster: get(raw, 'M365_CoPilot_Cluster'),
			mwCspAnnualRenewal: renewal ?? get(raw, 'Has_MW_CSP_Annual_Renewal'),
			mwPaidSeatRange: get(raw, 'M365_Paid_Seat_Range'),
			hasTransactedProduct: get(raw, 'Has_Transacted_Product'),
			hasCompete: get(raw, 'Has_Compete'),
			licensesCount: parseOrgSize(orgSize),
			orgSizeRange: parseOrgSizeRange(orgSize),
			subscriptionEndDate: parseRenewalMonthYear(renewal),
		};
	},

	validate(raw: Record<string, string>): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		if (!get(raw, 'AccountName')) {
			errors.push('AccountName is required');
		}
		return { valid: errors.length === 0, errors };
	},
};
