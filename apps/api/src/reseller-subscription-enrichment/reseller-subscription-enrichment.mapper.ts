import type { ResellerEnrichmentRow } from './reseller-subscription-enrichment.types';

const FIELD_ALIASES: Record<keyof ResellerEnrichmentRow, string[]> = {
	customerTpid: ['customer tpid', 'tpid', 'customer id'],
	accountName: ['customer name', 'account name', 'tenant name'],
	countryName: ['tenant country/region', 'country', 'country/region'],
	tenantIds: ['tenant id', 'tenant ids'],
	subscriptionEndDate: [
		'largest seat csp renewal',
		'subscription end date',
		'renewal date',
	],
	copilotEligibleM365Seats: [
		'copilot eligible m365 seats',
		'copilot eligible seats',
	],
	copilotSeatsWhitespace: [
		'copilot seats whitespace',
		'copilot whitespace',
	],
	adoptionStatus: ['adoption status'],
	freeCopilotChatMAU: [
		'free copilot chat mau (unlicensed)',
		'free copilot chat mau',
	],
	allAgentMAU: ['all agents mau', 'all agent mau'],
	mciEligibility: ['mci eligibility'],
	partnerName: ['t2 reseller name', 'partner name'],
	mciEngagementName: ['mci engagement name'],
	dominantSkuGroup: ['dominant sku group'],
};

function normalizeHeader(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface HeaderMap {
	fieldToHeader: Partial<Record<keyof ResellerEnrichmentRow, string>>;
	missing: Array<keyof ResellerEnrichmentRow>;
}

export function resolveHeaderMap(headers: string[]): HeaderMap {
	const normalized = headers.map((h) => ({
		original: h,
		norm: normalizeHeader(h),
	}));
	const fieldToHeader: Partial<Record<keyof ResellerEnrichmentRow, string>> = {};
	const missing: Array<keyof ResellerEnrichmentRow> = [];

	for (const field of Object.keys(FIELD_ALIASES) as Array<
		keyof ResellerEnrichmentRow
	>) {
		const aliases = FIELD_ALIASES[field];
		const match = normalized.find((h) => aliases.includes(h.norm));
		if (match) {
			fieldToHeader[field] = match.original;
		} else {
			missing.push(field);
		}
	}

	return { fieldToHeader, missing };
}

function parseOptionalInt(raw: unknown): number | null {
	if (raw === undefined || raw === null) return null;
	const trimmed = String(raw).replace(/,/g, '').trim();
	if (!trimmed) return null;
	const num = Number(trimmed);
	if (!Number.isFinite(num)) return null;
	return Math.round(num);
}

function parseOptionalText(raw: unknown): string | null {
	if (raw === undefined || raw === null) return null;
	const trimmed = String(raw).trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalDate(raw: unknown): string | null {
	if (raw === undefined || raw === null) return null;
	if (raw instanceof Date) {
		if (Number.isNaN(raw.getTime())) return null;
		return raw.toISOString().slice(0, 10);
	}
	const trimmed = String(raw).trim();
	if (!trimmed) return null;
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString().slice(0, 10);
}

export function mapRow(
	row: Record<string, unknown>,
	headerMap: HeaderMap['fieldToHeader'],
): ResellerEnrichmentRow {
	const get = (field: keyof ResellerEnrichmentRow): unknown => {
		const header = headerMap[field];
		return header ? row[header] : undefined;
	};

	return {
		customerTpid: parseOptionalText(get('customerTpid')),
		accountName: parseOptionalText(get('accountName')),
		countryName: parseOptionalText(get('countryName')),
		tenantIds: parseOptionalText(get('tenantIds')),
		subscriptionEndDate: parseOptionalDate(get('subscriptionEndDate')),
		copilotEligibleM365Seats: parseOptionalInt(get('copilotEligibleM365Seats')),
		copilotSeatsWhitespace: parseOptionalInt(get('copilotSeatsWhitespace')),
		adoptionStatus: parseOptionalText(get('adoptionStatus')),
		freeCopilotChatMAU: parseOptionalInt(get('freeCopilotChatMAU')),
		allAgentMAU: parseOptionalInt(get('allAgentMAU')),
		mciEligibility: parseOptionalInt(get('mciEligibility')),
		partnerName: parseOptionalText(get('partnerName')),
		mciEngagementName: parseOptionalText(get('mciEngagementName')),
		dominantSkuGroup: parseOptionalText(get('dominantSkuGroup')),
	};
}

export function deriveCopilotMAUPercentage(
	row: ResellerEnrichmentRow,
): number | null {
	if (
		row.freeCopilotChatMAU === null ||
		row.copilotEligibleM365Seats === null ||
		row.copilotEligibleM365Seats <= 0
	) {
		return null;
	}
	return row.freeCopilotChatMAU / row.copilotEligibleM365Seats;
}

const ENRICHABLE_FIELDS = [
	'accountName',
	'countryName',
	'tenantIds',
	'subscriptionEndDate',
	'copilotEligibleM365Seats',
	'copilotSeatsWhitespace',
	'adoptionStatus',
	'freeCopilotChatMAU',
	'allAgentMAU',
	'mciEligibility',
	'partnerName',
	'mciEngagementName',
	'dominantSkuGroup',
] as const satisfies ReadonlyArray<
	Exclude<keyof ResellerEnrichmentRow, 'customerTpid'>
>;

export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

function isFieldEmpty(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string' && value.trim() === '') return true;
	return false;
}

export function buildEnrichmentUpdate(
	row: ResellerEnrichmentRow,
	existing: Partial<Record<EnrichableField | 'copilotMAUPercentage', unknown>>,
): Record<string, unknown> {
	const update: Record<string, unknown> = {};
	for (const field of ENRICHABLE_FIELDS) {
		const incoming = row[field];
		if (incoming === null || incoming === undefined) continue;
		if (!isFieldEmpty(existing[field])) continue;
		update[field] = incoming;
	}
	if (isFieldEmpty(existing.copilotMAUPercentage)) {
		const pct = deriveCopilotMAUPercentage(row);
		if (pct !== null) update.copilotMAUPercentage = pct;
	}
	return update;
}

export function buildInsertValues(
	row: ResellerEnrichmentRow,
): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const field of ENRICHABLE_FIELDS) {
		if (row[field] !== null) values[field] = row[field];
	}
	const pct = deriveCopilotMAUPercentage(row);
	if (pct !== null) values.copilotMAUPercentage = pct;
	return values;
}

const ALLOWED_DOMINANT_SKU_GROUPS = ['BP', 'BS', 'BB'];

/**
 * Visibility rule for an ASPX-inserted row:
 *   - hidden if Copilot Eligible M365 Seats > 300
 *   - hidden if Dominant SKU Group is set and not one of BP / BS / BB
 *   - otherwise visible
 *
 * Only applied on insert. ASPX enrichment of an existing row never flips
 * visibility; a hidden row only becomes visible once a Renewal upload sets
 * subscriptionName + licensesCount.
 */
export function isAspxDashboardVisible(row: ResellerEnrichmentRow): boolean {
	if (
		row.copilotEligibleM365Seats !== null &&
		row.copilotEligibleM365Seats > 300
	) {
		return false;
	}
	if (row.dominantSkuGroup) {
		const normalized = row.dominantSkuGroup.trim().toUpperCase();
		if (!ALLOWED_DOMINANT_SKU_GROUPS.includes(normalized)) {
			return false;
		}
	}
	return true;
}
