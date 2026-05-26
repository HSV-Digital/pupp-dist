import type { ParseResult, RenewalSubscription } from '@repo/types';
import {
	normalizeSubscription,
	type RawSubscriptionInput,
} from './normalize-subscription';

function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsText(file);
	});
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(reader.error);
		reader.readAsArrayBuffer(file);
	});
}

/**
 * Supported input header aliases for each normalized field.
 * Includes TD-Synnex columns and legacy CSV columns during migration.
 */
export const COLUMN_MAP: Record<string, keyof RawSubscriptionInput> = {
	TPID: 'customerId',
	'Customer ID': 'customerId',
	'Top Parent Name': 'customerName',
	'Customer Name': 'customerName',
	'Subscription ID': 'subscriptionId',
	'Expiration Ending Product': 'currentProduct',
	'Current Product': 'currentProduct',
	'Expiration Ending Seats': 'seatCount',
	'Seat Count': 'seatCount',
	'CSP Annualized Expiring Revenue': 'annualRevenueRunRate',
	'Annual Revenue Run Rate': 'annualRevenueRunRate',
	'Subscription End Date': 'renewalDate',
	'Renewal Date': 'renewalDate',
	'Reseller Name (From)': 'resellerName',
	'Reseller Name': 'resellerName',
	'Distributor Name (From)': 'distributorName',
	'Distributor Name': 'distributorName',
	'Copilot Flag (CSP)': 'hasCopilot',
	'Has Copilot': 'hasCopilot',
	'PSS (AI Workforce)': 'pssAIWorkforceName',
	'PSS Workforce Name': 'pssAIWorkforceName',
	'PSS (AI Security)': 'pssAISecurityName',
	'PSS Security Name': 'pssAISecurityName',
	'PSA Name': 'psaName',
	'X-CSA PSA': 'psaName',
	'PDM Name': 'pdmName',
	PDM: 'pdmName',
	'PMM Name': 'pmmName',
	PMM: 'pmmName',
	'Term Months': 'termMonths',
	'Auto Renew': 'autoRenew',
	'Multi Year': 'multiYear',
	'Has Purview': 'hasPurview',
	'Has SureStep': 'hasSureStep',
	'Current Margin': 'currentMargin',
	'Customer Segment': 'customerSegment',
	Region: 'region',
	Notes: 'notes',
};

const REQUIRED_FIELDS: (keyof RawSubscriptionInput)[] = [
	'customerId',
	'customerName',
	'subscriptionId',
	'currentProduct',
	'seatCount',
	'annualRevenueRunRate',
	'renewalDate',
	'resellerName',
	'distributorName',
];

const REQUIRED_LABELS: Record<keyof RawSubscriptionInput, string> = {
	customerId: 'TPID',
	customerName: 'Top Parent Name',
	subscriptionId: 'Subscription ID',
	currentProduct: 'Expiration Ending Product',
	seatCount: 'Expiration Ending Seats',
	annualRevenueRunRate: 'CSP Annualized Expiring Revenue',
	renewalDate: 'Subscription End Date',
	resellerName: 'Reseller Name (From)',
	distributorName: 'Distributor Name (From)',
	hasCopilot: 'Copilot Flag (CSP)',
	pssAIWorkforceName: 'PSS (AI Workforce)',
	pssAISecurityName: 'PSS (AI Security)',
	psaName: 'PSA Name',
	pdmName: 'PDM Name',
	pmmName: 'PMM Name',
	termMonths: 'Term Months',
	autoRenew: 'Auto Renew',
	multiYear: 'Multi Year',
	hasPurview: 'Has Purview',
	hasSureStep: 'Has SureStep',
	currentMargin: 'Current Margin',
	customerSegment: 'Customer Segment',
	region: 'Region',
	notes: 'Notes',
};

function normalizeHeader(header: string): string {
	return header.replace(/^\uFEFF/, '').trim();
}

type HeaderIndex = Map<string, keyof RawSubscriptionInput>;

function buildHeaderIndex(headers: string[]): {
	index: HeaderIndex;
	missing: string[];
} {
	const lowerToField = new Map<string, keyof RawSubscriptionInput>();
	for (const [header, field] of Object.entries(COLUMN_MAP)) {
		lowerToField.set(normalizeHeader(header).toLowerCase(), field);
	}

	const index: HeaderIndex = new Map();
	const matchedFields = new Set<keyof RawSubscriptionInput>();

	for (const header of headers) {
		const cleaned = normalizeHeader(header);
		const field = lowerToField.get(cleaned.toLowerCase());
		if (field) {
			index.set(cleaned, field);
			matchedFields.add(field);
		}
	}

	const missing = REQUIRED_FIELDS.filter(
		(field) => !matchedFields.has(field),
	).map((field) => REQUIRED_LABELS[field]);

	return { index, missing };
}

export function validateHeaders(headers: string[]): string[] {
	const { missing } = buildHeaderIndex(headers);
	return missing;
}

function getFieldValue(
	row: Record<string, string>,
	headerToField: HeaderIndex,
	targetField: keyof RawSubscriptionInput,
): string {
	for (const [header, field] of headerToField) {
		if (field === targetField) {
			return (row[header] ?? '').trim();
		}
	}
	return '';
}

export function normalizeRow(
	row: Record<string, string>,
	rowIndex: number,
	headerToField: HeaderIndex,
): { data?: RenewalSubscription; error?: string } {
	const raw: RawSubscriptionInput = {
		customerId: getFieldValue(row, headerToField, 'customerId'),
		customerName: getFieldValue(row, headerToField, 'customerName'),
		subscriptionId: getFieldValue(row, headerToField, 'subscriptionId'),
		currentProduct: getFieldValue(row, headerToField, 'currentProduct'),
		seatCount: getFieldValue(row, headerToField, 'seatCount'),
		annualRevenueRunRate: getFieldValue(
			row,
			headerToField,
			'annualRevenueRunRate',
		),
		renewalDate: getFieldValue(row, headerToField, 'renewalDate'),
		resellerName: getFieldValue(row, headerToField, 'resellerName'),
		distributorName: getFieldValue(row, headerToField, 'distributorName'),
		hasCopilot: getFieldValue(row, headerToField, 'hasCopilot'),
		pssAIWorkforceName: getFieldValue(row, headerToField, 'pssAIWorkforceName'),
		pssAISecurityName: getFieldValue(row, headerToField, 'pssAISecurityName'),
		psaName: getFieldValue(row, headerToField, 'psaName'),
		pdmName: getFieldValue(row, headerToField, 'pdmName'),
		pmmName: getFieldValue(row, headerToField, 'pmmName'),
		termMonths: getFieldValue(row, headerToField, 'termMonths'),
		autoRenew: getFieldValue(row, headerToField, 'autoRenew'),
		multiYear: getFieldValue(row, headerToField, 'multiYear'),
		hasPurview: getFieldValue(row, headerToField, 'hasPurview'),
		hasSureStep: getFieldValue(row, headerToField, 'hasSureStep'),
		currentMargin: getFieldValue(row, headerToField, 'currentMargin'),
		customerSegment: getFieldValue(row, headerToField, 'customerSegment'),
		region: getFieldValue(row, headerToField, 'region'),
		notes: getFieldValue(row, headerToField, 'notes'),
	};

	const { data, error } = normalizeSubscription(raw);
	if (data) {
		return { data };
	}

	return { error: `Row ${rowIndex + 1}: ${error ?? 'invalid row'}` };
}

export async function parseFile(
	file: File,
): Promise<{ data: RenewalSubscription[]; result: ParseResult }> {
	const ext = file.name.split('.').pop()?.toLowerCase();

	let rows: Record<string, string>[];
	let headers: string[];

	if (ext === 'xlsx' || ext === 'xls') {
		const ExcelJS = await import('exceljs');
		const workbook = new ExcelJS.Workbook();
		const buffer = await readFileAsArrayBuffer(file);
		await workbook.xlsx.load(buffer);
		const sheet = workbook.worksheets[0];
		const headerRow = sheet.getRow(1);
		headers = [];
		headerRow.eachCell((cell) => {
			headers.push(normalizeHeader(String(cell.value ?? '')));
		});
		const json: Record<string, string>[] = [];
		sheet.eachRow((row, rowNumber) => {
			if (rowNumber === 1) return;
			const record: Record<string, string> = {};
			row.eachCell((cell, colNumber) => {
				record[headers[colNumber - 1]] = String(cell.value ?? '');
			});
			json.push(record);
		});
		rows = json;
	} else {
		const PapaModule = await import('papaparse');
		const Papa = PapaModule.default ?? PapaModule;
		const text = await readFileAsText(file);
		const parsed = Papa.parse<Record<string, string>>(text, {
			header: true,
			skipEmptyLines: true,
		});
		headers = (parsed.meta.fields ?? []).map(normalizeHeader);
		rows = parsed.data;
	}

	const { index: headerToField, missing } = buildHeaderIndex(headers);
	if (missing.length > 0) {
		return {
			data: [],
			result: {
				successful: 0,
				skipped: rows.length,
				errors: [`Missing columns: ${missing.join(', ')}`],
			},
		};
	}

	const data: RenewalSubscription[] = [];
	const errors: string[] = [];

	for (let i = 0; i < rows.length; i++) {
		const { data: record, error } = normalizeRow(rows[i], i, headerToField);
		if (record) {
			data.push(record);
		} else if (error) {
			errors.push(error);
		}
	}

	return {
		data,
		result: {
			successful: data.length,
			skipped: rows.length - data.length,
			errors,
		},
	};
}
