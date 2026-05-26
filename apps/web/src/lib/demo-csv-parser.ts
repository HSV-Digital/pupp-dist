import { CustomerRegion } from '@repo/types';

const VALID_REGIONS = new Set(Object.values(CustomerRegion));

const VALID_SKUS = new Set([
	'Business Basic',
	'Business Standard',
	'Business Premium',
	'Other',
]);

/**
 * Check whether a raw SKU / renewal-option value is a recognised SKU name.
 * Accepts exact labels ("Business Premium") *and* custom product names that
 * contain both "Business" and a type keyword (e.g. "M365 Business Premium").
 * Returns the original value as-is so the actual name is preserved, or
 * null when no keyword matches (row should be rejected).
 */
function isValidSkuValue(raw: string): boolean {
	if (!raw) return false;
	if (VALID_SKUS.has(raw)) return true;

	const lower = raw.toLowerCase();
	const hasBusiness = lower.includes('business');
	return hasBusiness && (lower.includes('premium') || lower.includes('standard') || lower.includes('basic'));
}

export interface ResellerCsvRow {
	customerName: string;
	currentSku: string;
	seats: number;
	costPerUser: number;
	renewalDate: string;
	region: string;
}

export interface RejectedRow {
	rowNumber: number;
	raw: Record<string, string>;
	error: string;
}

export interface ResellerCsvParseResult {
	valid: ResellerCsvRow[];
	rejected: RejectedRow[];
}

const COLUMN_MAP: Record<string, keyof ResellerCsvRow> = {
	'customer name': 'customerName',
	'customer': 'customerName',
	'sku': 'currentSku',
	'current sku': 'currentSku',
	'renewal option': 'currentSku',
	'renewal options': 'currentSku',
	'seats': 'seats',
	'number of seats': 'seats',
	'cost per user': 'costPerUser',
	'cost/user': 'costPerUser',
	'renewal date': 'renewalDate',
	'renewal': 'renewalDate',
	'region': 'region',
};

const REQUIRED_COLUMNS: (keyof ResellerCsvRow)[] = [
	'customerName',
	'seats',
	'costPerUser',
	'region',
];

const DISPLAY_NAMES: Record<keyof ResellerCsvRow, string> = {
	customerName: 'Customer Name',
	currentSku: 'SKU',
	seats: 'Seats',
	costPerUser: 'Cost Per User',
	renewalDate: 'Renewal Date',
	region: 'Region',
};

function normalizeHeader(header: string): string {
	return header.replace(/^\uFEFF/, '').trim().toLowerCase();
}

type HeaderIndex = Map<string, keyof ResellerCsvRow>;

function buildHeaderIndex(headers: string[]): {
	index: HeaderIndex;
	missing: string[];
} {
	const index: HeaderIndex = new Map();
	const matched = new Set<keyof ResellerCsvRow>();

	for (const header of headers) {
		const cleaned = normalizeHeader(header);
		const field = COLUMN_MAP[cleaned];
		if (field) {
			index.set(header, field);
			matched.add(field);
		}
	}

	const missing = REQUIRED_COLUMNS.filter((f) => !matched.has(f)).map(
		(f) => DISPLAY_NAMES[f],
	);

	return { index, missing };
}

function getField(
	row: Record<string, string>,
	headerIndex: HeaderIndex,
	field: keyof ResellerCsvRow,
): string {
	for (const [header, f] of headerIndex) {
		if (f === field) return (row[header] ?? '').trim();
	}
	return '';
}

function validateRow(
	row: Record<string, string>,
	headerIndex: HeaderIndex,
): { data?: ResellerCsvRow; error?: string } {
	const customerName = getField(row, headerIndex, 'customerName');
	if (!customerName) return { error: 'Customer Name is required' };

	const rawSku = getField(row, headerIndex, 'currentSku');
	if (rawSku && !isValidSkuValue(rawSku)) {
		return { error: `Invalid SKU / Renewal Option "${rawSku}". Must contain "Business" and one of: Basic, Standard, or Premium (e.g. M365 Business Premium)` };
	}
	const currentSku = rawSku || 'Other';

	const seatsRaw = getField(row, headerIndex, 'seats');
	const seats = Number(seatsRaw);
	if (!seatsRaw || !Number.isFinite(seats) || seats < 1 || seats !== Math.floor(seats)) {
		return { error: `Invalid Seats "${seatsRaw}". Must be a positive integer` };
	}
	if (seats > 300) {
		return { error: `Seats "${seatsRaw}" exceeds maximum of 300` };
	}

	const costRaw = getField(row, headerIndex, 'costPerUser');
	const costPerUser = Number(costRaw);
	if (!costRaw || !Number.isFinite(costPerUser) || costPerUser < 0) {
		return { error: `Invalid Cost Per User "${costRaw}". Must be a non-negative number` };
	}

	const renewalDate = getField(row, headerIndex, 'renewalDate');
	let normalizedDate: string;
	if (renewalDate) {
		const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(renewalDate);
		if (!dateMatch) {
			const parsed = new Date(renewalDate);
			if (!Number.isFinite(parsed.getTime())) {
				return { error: `Invalid Renewal Date "${renewalDate}". Use YYYY-MM-DD format` };
			}
		}
		normalizedDate = dateMatch
			? renewalDate
			: new Date(renewalDate).toISOString().slice(0, 10);
	} else {
		normalizedDate = '';
	}

	const region = getField(row, headerIndex, 'region');
	if (!region) return { error: 'Region is required' };
	if (!VALID_REGIONS.has(region as CustomerRegion)) {
		return {
			error: `Invalid Region "${region}". Must be one of: ${[...VALID_REGIONS].join(', ')}`,
		};
	}

	return {
		data: {
			customerName,
			currentSku,
			seats,
			costPerUser,
			renewalDate: normalizedDate,
			region,
		},
	};
}

export async function parseResellerCsv(
	file: File,
): Promise<ResellerCsvParseResult> {
	const PapaModule = await import('papaparse');
	const Papa = PapaModule.default ?? PapaModule;

	const text = await readFileAsText(file);
	const parsed = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: true,
	});

	const headers = parsed.meta.fields ?? [];
	const { index: headerIndex, missing } = buildHeaderIndex(headers);

	if (missing.length > 0) {
		return {
			valid: [],
			rejected: parsed.data.map((raw, i) => ({
				rowNumber: i + 2,
				raw,
				error: `Missing columns: ${missing.join(', ')}`,
			})),
		};
	}

	const valid: ResellerCsvRow[] = [];
	const rejected: RejectedRow[] = [];

	for (let i = 0; i < parsed.data.length; i++) {
		const row = parsed.data[i];
		const result = validateRow(row, headerIndex);
		if (result.data) {
			valid.push(result.data);
		} else {
			rejected.push({
				rowNumber: i + 2,
				raw: row,
				error: result.error ?? 'Unknown error',
			});
		}
	}

	return { valid, rejected };
}

export function generateSampleCsv(): string {
	const headers = [
		'Customer Name',
		'SKU',
		'Seats',
		'Cost Per User',
		'Renewal Date',
		'Region',
	];
	const sample = [
		'Northwind Traders,M365 Business Standard,150,12.50,2026-06-15,United States',
		'Contoso Ltd,M365 Business Premium,200,22.00,2026-09-01,Canada',
	];
	return [headers.join(','), ...sample].join('\n');
}

export function generateRejectedCsv(rejected: RejectedRow[]): string {
	if (rejected.length === 0) return '';
	const allKeys = new Set<string>();
	for (const r of rejected) {
		for (const key of Object.keys(r.raw)) {
			allKeys.add(key);
		}
	}
	const headers = [...allKeys, 'Error'];
	const rows = rejected.map((r) => {
		const values = [...allKeys].map((key) => escapeCsvValue(r.raw[key] ?? ''));
		values.push(escapeCsvValue(r.error));
		return values.join(',');
	});
	return [headers.map(escapeCsvValue).join(','), ...rows].join('\n');
}

function escapeCsvValue(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsText(file);
	});
}

export const CSV_COLUMN_SPEC = [
	{ column: 'Customer Name', type: 'Text', values: 'Should not be empty' },
	{ column: 'SKU / Renewal Option', type: 'Text (optional)', values: 'Value containing Business Basic, Business Standard, or Business Premium. Defaults to Other if left empty' },
	{ column: 'Seats', type: 'Integer', values: '1 – 300' },
	{ column: 'Cost Per User', type: 'Number', values: '>= 0' },
	{ column: 'Renewal Date', type: 'Date (optional)', values: 'YYYY-MM-DD' },
	{ column: 'Region', type: 'Text', values: Object.values(CustomerRegion).join(', ') },
] as const;
