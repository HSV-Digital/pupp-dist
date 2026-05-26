import type { RenewalSubscription } from '@repo/types';

const BOOLEAN_TRUTHY = new Set(['true', 'yes', '1', 'y']);

export interface RawSubscriptionInput {
	customerId?: string | number | null;
	customerName?: string | null;
	subscriptionId?: string | null;
	currentProduct?: string | null;
	seatCount?: string | number | null;
	annualRevenueRunRate?: string | number | null;
	renewalDate?: string | null;
	resellerName?: string | null;
	distributorName?: string | null;
	pssAIWorkforceName?: string | null;
	pssAISecurityName?: string | null;
	psaName?: string | null;
	pdmName?: string | null;
	pmmName?: string | null;
	termMonths?: string | number | null;
	autoRenew?: string | boolean | null;
	multiYear?: string | boolean | null;
	hasCopilot?: string | boolean | null;
	hasPurview?: string | boolean | null;
	hasSureStep?: string | boolean | null;
	currentMargin?: string | number | null;
	customerSegment?: string | null;
	region?: string | null;
	notes?: string | null;
}

export type TdSynnexCsvRow = Record<string, string | undefined>;

function normalizeString(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function parseBoolean(value: unknown): boolean {
	return BOOLEAN_TRUTHY.has(normalizeString(value).toLowerCase());
}

function parseNumber(value: unknown): number {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : 0;
	}

	const cleaned = normalizeString(value)
		.replace(/[$,%]/g, '')
		.replace(/,/g, '');
	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value: unknown): number {
	return Math.max(0, Math.floor(parseNumber(value)));
}

function padTwo(value: string): string {
	return value.padStart(2, '0');
}

function normalizeDate(value: unknown): string {
	const input = normalizeString(value);
	if (!input) return '';

	if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

	const mdyMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (mdyMatch) {
		const [, month, day, year] = mdyMatch;
		return `${year}-${padTwo(month)}-${padTwo(day)}`;
	}

	return input;
}

function categorizeProduct(
	productName: string,
): RenewalSubscription['skuCategory'] {
	const lower = productName.toLowerCase();

	if (lower.includes('copilot'))
		return 'Copilot' as RenewalSubscription['skuCategory'];
	if (lower.includes('e5')) return 'E5' as RenewalSubscription['skuCategory'];
	if (lower.includes('e3')) return 'E3' as RenewalSubscription['skuCategory'];
	if (lower.includes('premium'))
		return 'Premium' as RenewalSubscription['skuCategory'];
	if (lower.includes('standard'))
		return 'Standard' as RenewalSubscription['skuCategory'];
	if (lower.includes('basic'))
		return 'Basic' as RenewalSubscription['skuCategory'];

	return 'Other' as RenewalSubscription['skuCategory'];
}

export function mapTdSynnexCsvRow(
	row: TdSynnexCsvRow,
	rowIndex?: number,
): RawSubscriptionInput {
	const tpid = row['TPID'] ?? '';
	return {
		customerId: tpid,
		customerName: row['Top Parent Name'],
		subscriptionId:
			row['Subscription ID'] || (tpid ? `${tpid}-${rowIndex ?? 0}` : undefined),
		currentProduct: row['Expiration Ending Product'],
		seatCount: row['Expiration Ending Seats'],
		annualRevenueRunRate: row['CSP Annualized Expiring Revenue'],
		renewalDate: row['Subscription End Date'],
		resellerName: row['Reseller Name (From)'],
		distributorName: row['Distributor Name (From)'] || row['Disti Name'],
		region: row['Area'],
		hasCopilot: row['Copilot Flag (CSP)'],
	};
}

export function normalizeSubscription(input: RawSubscriptionInput): {
	data?: RenewalSubscription;
	error?: string;
} {
	const customerId = normalizeString(input.customerId);
	if (!customerId) {
		return { error: 'missing customerId' };
	}

	const subscriptionId = normalizeString(input.subscriptionId);
	if (!subscriptionId) {
		return { error: 'missing subscriptionId' };
	}

	const currentProduct = normalizeString(input.currentProduct);

	const data: RenewalSubscription = {
		customerId,
		customerName: normalizeString(input.customerName),
		subscriptionId,
		currentProduct,
		seatCount: parseInteger(input.seatCount),
		annualRevenueRunRate: parseNumber(input.annualRevenueRunRate),
		renewalDate: normalizeDate(input.renewalDate),
		resellerName: normalizeString(input.resellerName),
		distributorName: normalizeString(input.distributorName),
		pssAIWorkforceName: normalizeString(input.pssAIWorkforceName),
		pssAISecurityName: normalizeString(input.pssAISecurityName),
		psaName: normalizeString(input.psaName),
		pdmName: normalizeString(input.pdmName),
		pmmName: normalizeString(input.pmmName),
		termMonths: parseInteger(input.termMonths) || 12,
		autoRenew: parseBoolean(input.autoRenew),
		multiYear: parseBoolean(input.multiYear),
		hasCopilot: parseBoolean(input.hasCopilot),
		hasPurview: parseBoolean(input.hasPurview),
		hasSureStep: parseBoolean(input.hasSureStep),
		currentMargin: parseNumber(input.currentMargin),
		customerSegment: normalizeString(input.customerSegment),
		region: normalizeString(input.region),
		notes: normalizeString(input.notes),
		skuCategory: categorizeProduct(currentProduct),
	};

	return { data };
}
