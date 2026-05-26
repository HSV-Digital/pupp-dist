import type { ColumnMapper, MappedRow } from '../upload.types';
import {
	ALLOWED_SUBSCRIPTION_NAME_ERROR,
	isRequiredAllowedSubscriptionName,
} from './subscription-name';

const MAX_LICENSES_COUNT = 300;

function get(raw: Record<string, string>, key: string): string | undefined {
	const val = raw[key]?.trim();
	return val && val.length > 0 ? val : undefined;
}

function parseSeats(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return Math.min(parsed, MAX_LICENSES_COUNT);
}

export const renewalMicrosoftMapper: ColumnMapper = {
	sourceType: 'RENEWAL_MICROSOFT',

	mapRow(raw: Record<string, string>): MappedRow {
		return {
			distributorName: get(raw, 'Distributor Name (From)'),
			distributorId: get(raw, 'Distributor ID (From)'),
			partnerName: get(raw, 'Reseller Name (From)'),
			customerTpid: get(raw, 'TPID'),
			accountName: get(raw, 'Customer Name'),
			countryName: get(raw, 'Region'),
			subscriptionName: get(raw, 'Expiration Ending Product'),
			licensesCount: parseSeats(get(raw, 'Expiration Ending Seats')),
			subscriptionEndDate: get(raw, 'Subscription End Date'),
			type: get(raw, 'Type'),
		};
	},

	validate(raw: Record<string, string>): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		if (!get(raw, 'Customer Name')) {
			errors.push('Customer Name is required');
		}
		if (
			!isRequiredAllowedSubscriptionName(
				get(raw, 'Expiration Ending Product'),
			)
		) {
			errors.push(ALLOWED_SUBSCRIPTION_NAME_ERROR);
		}
		return { valid: errors.length === 0, errors };
	},
};
