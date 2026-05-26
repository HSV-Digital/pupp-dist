import { CustomerRegion } from '@repo/types';

const VALID_REGIONS = new Set(Object.values(CustomerRegion));

const VALID_MONTHS = new Set([
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
]);

export interface ResellerCsvRow {
	customerName: string;
	customerTpid: string;
	countryName: string;
	renewalMonth: string;
	subscriptionName: string;
	licenseCount: number;
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
	'customer tpid': 'customerTpid',
	'tpid': 'customerTpid',
	'country name': 'countryName',
	'country': 'countryName',
	'region': 'countryName',
	'renewal month': 'renewalMonth',
	'microsoft 365 subscription': 'subscriptionName',
	'subscription': 'subscriptionName',
	'subscription name': 'subscriptionName',
	'sku': 'subscriptionName',
	'current sku': 'subscriptionName',
	'license count': 'licenseCount',
	'licenses': 'licenseCount',
	'seats': 'licenseCount',
	'number of seats': 'licenseCount',
};

const REQUIRED_COLUMNS: (keyof ResellerCsvRow)[] = [
	'customerName',
	'countryName',
];

const DISPLAY_NAMES: Record<keyof ResellerCsvRow, string> = {
	customerName: 'Customer Name',
	customerTpid: 'Customer TPID',
	countryName: 'Country Name',
	renewalMonth: 'Renewal Month',
	subscriptionName: 'Microsoft 365 Subscription',
	licenseCount: 'License Count',
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

	const countryName = getField(row, headerIndex, 'countryName');
	if (!countryName) return { error: 'Country Name is required' };
	if (!VALID_REGIONS.has(countryName as CustomerRegion)) {
		return {
			error: `Invalid Country Name "${countryName}". Must be one of: ${[...VALID_REGIONS].join(', ')}`,
		};
	}

	const customerTpid = getField(row, headerIndex, 'customerTpid');

	const renewalMonth = getField(row, headerIndex, 'renewalMonth');
	if (renewalMonth && !VALID_MONTHS.has(renewalMonth)) {
		return {
			error: `Invalid Renewal Month "${renewalMonth}". Must be a month name (e.g. January, February)`,
		};
	}

	const subscriptionName = getField(row, headerIndex, 'subscriptionName');

	const licenseCountRaw = getField(row, headerIndex, 'licenseCount');
	let licenseCount = 0;
	if (licenseCountRaw) {
		licenseCount = Number(licenseCountRaw);
		if (!Number.isFinite(licenseCount) || licenseCount < 0) {
			return { error: `Invalid License Count "${licenseCountRaw}". Must be a non-negative number` };
		}
		licenseCount = Math.floor(licenseCount);
	}

	return {
		data: {
			customerName,
			customerTpid,
			countryName,
			renewalMonth,
			subscriptionName,
			licenseCount,
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
		'Customer TPID',
		'Country Name',
		'Renewal Month',
		'Microsoft 365 Subscription',
		'License Count',
	];
	const sample = [
		'Northwind Traders,10045,United States,June,Business Standard,150',
		'Contoso Ltd,,Canada,September,Business Premium,200',
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
	{ column: 'Customer Name', type: 'Text', values: 'Required' },
	{ column: 'Customer TPID', type: 'Number', values: 'Optional' },
	{ column: 'Country Name', type: 'Text', values: Object.values(CustomerRegion).join(', ') },
	{ column: 'Renewal Month', type: 'Text', values: 'January, February, ... December' },
	{ column: 'Microsoft 365 Subscription', type: 'Text', values: 'Business Basic, Business Standard, Business Premium, Other' },
	{ column: 'License Count', type: 'Number', values: 'Optional, >= 0' },
] as const;
