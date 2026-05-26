import type { ColumnMapper, MappedRow } from '../upload.types';
import {
	ALLOWED_SUBSCRIPTION_NAME_ERROR,
	isAllowedSubscriptionName,
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

export const customMapper: ColumnMapper = {
	sourceType: 'CUSTOM',

	mapRow(raw: Record<string, string>): MappedRow {
		return {
			accountName: get(raw, 'Customer Name'),
			countryName: get(raw, 'Country Name'),
			customerTpid: get(raw, 'Customer TPID'),
			mwCspAnnualRenewal: get(raw, 'Renewal Month'),
			subscriptionName: get(raw, 'Microsoft 365 Subscription'),
			licensesCount: parseSeats(get(raw, 'License Count')),
		};
	},

	validate(raw: Record<string, string>): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		if (!get(raw, 'Customer Name')) {
			errors.push('Customer Name is required');
		}
		if (!get(raw, 'Country Name')) {
			errors.push('Country Name is required');
		}
		if (!isAllowedSubscriptionName(get(raw, 'Microsoft 365 Subscription'))) {
			errors.push(ALLOWED_SUBSCRIPTION_NAME_ERROR);
		}
		return { valid: errors.length === 0, errors };
	},
};
