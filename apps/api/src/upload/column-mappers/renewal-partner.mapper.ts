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

export const renewalPartnerMapper: ColumnMapper = {
	sourceType: 'RENEWAL_PARTNER',

	mapRow(raw: Record<string, string>): MappedRow {
		return {
			partnerGlobalId: get(raw, 'PGAMpnId'),
			mpnId: get(raw, 'MpnId'),
			accountName: get(raw, 'CustomerName'),
			subscriptionName: get(raw, 'SubscriptionName'),
			licensesCount: parseSeats(get(raw, 'LicensesCount')),
			subscriptionEndDate: get(raw, 'SubscriptionEndDate'),
		};
	},

	validate(raw: Record<string, string>): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		if (!get(raw, 'CustomerName')) {
			errors.push('CustomerName is required');
		}
		if (!isRequiredAllowedSubscriptionName(get(raw, 'SubscriptionName'))) {
			errors.push(ALLOWED_SUBSCRIPTION_NAME_ERROR);
		}
		return { valid: errors.length === 0, errors };
	},
};
