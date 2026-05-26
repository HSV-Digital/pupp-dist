import { createHash } from 'node:crypto';

export type SourceType = 'direct' | 'indirect';

export interface RawRenewalRow {
	sourceType: SourceType;
	sourcePath: string;
	sourceRowNumber: number;
	tpid: string;
	customerName: string;
	subscriptionEndDate: string;
	expirationEndingProduct: string;
	expirationEndingSeats: string;
	type: string;
	resellerName: string;
	distributorId: string;
	distributorName: string;
	cspAnnualizedExpiringRevenue: string;
	region: string;
	subRegion: string;
	pdm: string;
	pmm: string;
	aiWorkforcePss: string;
	aiSecurityPss: string;
	xCsaPsa: string;
}

export interface PodMappingRow {
	sourceType: SourceType;
	sourcePath: string;
	sourceRowNumber: number;
	alias: string;
	partnerOneName: string;
	roleTitle: string;
	solutionArea: string;
	region: string;
}

interface HeaderIndexes {
	tpid: number;
	customerName: number;
	subscriptionEndDate: number;
	expirationEndingProduct: number;
	expirationEndingSeats: number;
	type: number;
	resellerName: number;
	distributorId: number;
	distributorName: number;
	cspAnnualizedExpiringRevenue: number;
	region: number;
	subRegion: number;
	pdm: number;
	pmm: number;
	aiWorkforcePss: number;
	aiSecurityPss: number;
	xCsaPsa: number;
}

interface PodMappingHeaderIndexes {
	alias: number;
	partnerOneName: number;
	roleTitle: number;
	solutionArea: number;
	region: number;
}

const REGION_TYPO_FIX: Record<string, string> = {
	'Unites States': 'United States',
};

export function normalizeHeaderName(header: string): string {
	return header
		.replace(/^\ufeff/u, '')
		.trim()
		.toLowerCase();
}

export function normalizeOptionalCsvValue(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return '';
	}

	const normalized = trimmed.toUpperCase();
	if (normalized === 'NA' || normalized === 'N/A' || normalized === 'NULL') {
		return '';
	}

	return trimmed;
}

export function normalizeSourceAlias(rawValue: string): string {
	const normalized = normalizeOptionalCsvValue(rawValue);
	return normalized ? normalized.toUpperCase() : '';
}

export function normalizeLookupValue(rawValue: string): string {
	return normalizeOptionalCsvValue(rawValue).replace(/\s+/g, ' ').toUpperCase();
}

export function normalizeRegion(value: string): string {
	const trimmed = normalizeOptionalCsvValue(value);
	if (!trimmed) {
		return '';
	}

	return REGION_TYPO_FIX[trimmed] ?? trimmed;
}

export function normalizeInteger(value: string, fallback = 0): number {
	const parsed = Number.parseInt(value.replace(/[\s,]/g, ''), 10);
	if (Number.isFinite(parsed)) {
		return parsed;
	}

	return fallback;
}

export function parseCsvMoney(value: string): number {
	const cleaned = value.replace(/[$,\s]/g, '');
	if (!cleaned) {
		return 0;
	}

	const parsed = Number.parseFloat(cleaned);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function parseCsvDate(
	value: string,
	context: { sourceType: SourceType; sourceRowNumber: number },
): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(
			`Missing Subscription End Date in ${context.sourceType} CSV row ${context.sourceRowNumber}.`,
		);
	}

	const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u);
	if (slashMatch) {
		const [, month, day, year] = slashMatch;
		return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
	}

	if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
		return trimmed;
	}

	throw new Error(
		`Invalid Subscription End Date "${trimmed}" in ${context.sourceType} CSV row ${context.sourceRowNumber}.`,
	);
}

export function categorizeProduct(productName: string): string {
	const lower = productName.toLowerCase();
	if (lower.includes('copilot')) return 'Copilot';
	if (lower.includes('e5')) return 'E5';
	if (lower.includes('e3')) return 'E3';
	if (lower.includes('premium')) return 'Premium';
	if (lower.includes('standard')) return 'Standard';
	if (lower.includes('basic')) return 'Basic';
	return 'Other';
}

export function mapSubscriptionType(rawType: string): string {
	const normalized = rawType.trim().toLowerCase();
	if (
		normalized.includes('2-tier') ||
		normalized.includes('2 tier') ||
		normalized.includes('indirect')
	) {
		return 'Indirect';
	}
	if (normalized.includes('direct')) {
		return 'Direct';
	}
	return 'Other';
}

function normalizeKeyPart(value: string): string {
	return value.trim().toLowerCase();
}

export function buildDedupeKey(input: {
	tpid: string;
	customerName: string;
	renewalDate: string;
	currentProduct: string;
	subscriptionType: string;
	resellerName: string;
	distributorId: string;
	distributorName: string;
}): string {
	return [
		normalizeKeyPart(input.tpid),
		normalizeKeyPart(input.customerName),
		input.renewalDate,
		normalizeKeyPart(input.currentProduct),
		normalizeKeyPart(input.subscriptionType),
		normalizeKeyPart(input.resellerName),
		normalizeKeyPart(input.distributorId),
		normalizeKeyPart(input.distributorName),
	].join('|');
}

export function buildStableSubscriptionId(identityKey: string): string {
	const digest = createHash('sha256')
		.update(identityKey)
		.digest('hex')
		.slice(0, 24);
	return `sub_${digest}`;
}

export function readCell(row: string[], index: number): string {
	if (index < 0) {
		return '';
	}

	return (row[index] ?? '').trim();
}

function findHeaderIndex(
	headerMap: Map<string, number>,
	candidates: string[],
	options: { required: boolean; label: string; csvPath: string },
): number {
	for (const candidate of candidates) {
		const index = headerMap.get(normalizeHeaderName(candidate));
		if (index !== undefined) {
			return index;
		}
	}

	if (options.required) {
		throw new Error(
			`CSV "${options.csvPath}" is missing required header "${options.label}".`,
		);
	}

	return -1;
}

function resolveRenewalsHeaderIndexes(
	headers: string[],
	csvPath: string,
): HeaderIndexes {
	const headerMap = new Map<string, number>();
	headers.forEach((header, index) => {
		headerMap.set(normalizeHeaderName(header), index);
	});

	return {
		tpid: findHeaderIndex(headerMap, ['TPID'], {
			required: true,
			label: 'TPID',
			csvPath,
		}),
		customerName: findHeaderIndex(
			headerMap,
			['Customer Name', 'Top Parent Name'],
			{
				required: true,
				label: 'Customer Name',
				csvPath,
			},
		),
		subscriptionEndDate: findHeaderIndex(headerMap, ['Subscription End Date'], {
			required: true,
			label: 'Subscription End Date',
			csvPath,
		}),
		expirationEndingProduct: findHeaderIndex(
			headerMap,
			['Expiration Ending Product'],
			{
				required: true,
				label: 'Expiration Ending Product',
				csvPath,
			},
		),
		expirationEndingSeats: findHeaderIndex(
			headerMap,
			['Expiration Ending Seats'],
			{
				required: true,
				label: 'Expiration Ending Seats',
				csvPath,
			},
		),
		type: findHeaderIndex(headerMap, ['Type'], {
			required: true,
			label: 'Type',
			csvPath,
		}),
		resellerName: findHeaderIndex(headerMap, ['Reseller Name (From)'], {
			required: false,
			label: 'Reseller Name (From)',
			csvPath,
		}),
		distributorId: findHeaderIndex(headerMap, ['Distributor ID (From)'], {
			required: false,
			label: 'Distributor ID (From)',
			csvPath,
		}),
		distributorName: findHeaderIndex(
			headerMap,
			['Distributor Name (From)', 'Disti Name'],
			{
				required: false,
				label: 'Distributor Name (From)',
				csvPath,
			},
		),
		cspAnnualizedExpiringRevenue: findHeaderIndex(
			headerMap,
			['CSP Annualized Expiring Revenue'],
			{
				required: true,
				label: 'CSP Annualized Expiring Revenue',
				csvPath,
			},
		),
		region: findHeaderIndex(headerMap, ['Region', 'Area'], {
			required: false,
			label: 'Region',
			csvPath,
		}),
		subRegion: findHeaderIndex(headerMap, ['SubRegion'], {
			required: false,
			label: 'SubRegion',
			csvPath,
		}),
		pdm: findHeaderIndex(headerMap, ['PDM'], {
			required: false,
			label: 'PDM',
			csvPath,
		}),
		pmm: findHeaderIndex(headerMap, ['PMM'], {
			required: false,
			label: 'PMM',
			csvPath,
		}),
		aiWorkforcePss: findHeaderIndex(headerMap, ['AI Workforce PSS'], {
			required: false,
			label: 'AI Workforce PSS',
			csvPath,
		}),
		aiSecurityPss: findHeaderIndex(headerMap, ['AI Security PSS'], {
			required: false,
			label: 'AI Security PSS',
			csvPath,
		}),
		xCsaPsa: findHeaderIndex(headerMap, ['X-CSA PSA'], {
			required: false,
			label: 'X-CSA PSA',
			csvPath,
		}),
	};
}

function resolvePodMappingHeaderIndexes(
	headers: string[],
	csvPath: string,
): PodMappingHeaderIndexes {
	const headerMap = new Map<string, number>();
	headers.forEach((header, index) => {
		headerMap.set(normalizeHeaderName(header), index);
	});

	return {
		alias: findHeaderIndex(headerMap, ['Alias'], {
			required: true,
			label: 'Alias',
			csvPath,
		}),
		partnerOneName: findHeaderIndex(headerMap, ['PartnerOneName'], {
			required: true,
			label: 'PartnerOneName',
			csvPath,
		}),
		roleTitle: findHeaderIndex(headerMap, ['Role Title'], {
			required: true,
			label: 'Role Title',
			csvPath,
		}),
		solutionArea: findHeaderIndex(
			headerMap,
			['Solution Area', 'Cloud Solution Area'],
			{
				required: true,
				label: 'Solution Area',
				csvPath,
			},
		),
		region: findHeaderIndex(headerMap, ['Region', 'Area', 'SubRegion'], {
			required: true,
			label: 'Region',
			csvPath,
		}),
	};
}

export function parseRenewalRowsFromParsedCsv(params: {
	sourceType: SourceType;
	csvPath: string;
	headers: string[];
	rows: string[][];
}): RawRenewalRow[] {
	const idx = resolveRenewalsHeaderIndexes(params.headers, params.csvPath);
	const parsed: RawRenewalRow[] = [];

	for (let rowIndex = 0; rowIndex < params.rows.length; rowIndex += 1) {
		const row = params.rows[rowIndex];
		const tpid = readCell(row, idx.tpid);
		if (!tpid) {
			continue;
		}

		parsed.push({
			sourceType: params.sourceType,
			sourcePath: params.csvPath,
			sourceRowNumber: rowIndex + 2,
			tpid,
			customerName: readCell(row, idx.customerName),
			subscriptionEndDate: readCell(row, idx.subscriptionEndDate),
			expirationEndingProduct: readCell(row, idx.expirationEndingProduct),
			expirationEndingSeats: readCell(row, idx.expirationEndingSeats),
			type: readCell(row, idx.type),
			resellerName: readCell(row, idx.resellerName),
			distributorId: readCell(row, idx.distributorId),
			distributorName: readCell(row, idx.distributorName),
			cspAnnualizedExpiringRevenue: readCell(
				row,
				idx.cspAnnualizedExpiringRevenue,
			),
			region: readCell(row, idx.region),
			subRegion: readCell(row, idx.subRegion),
			pdm: readCell(row, idx.pdm),
			pmm: readCell(row, idx.pmm),
			aiWorkforcePss: readCell(row, idx.aiWorkforcePss),
			aiSecurityPss: readCell(row, idx.aiSecurityPss),
			xCsaPsa: readCell(row, idx.xCsaPsa),
		});
	}

	return parsed;
}

export function parsePodMappingRowsFromParsedCsv(params: {
	sourceType: SourceType;
	csvPath: string;
	headers: string[];
	rows: string[][];
}): PodMappingRow[] {
	const idx = resolvePodMappingHeaderIndexes(params.headers, params.csvPath);
	const parsed: PodMappingRow[] = [];

	for (let rowIndex = 0; rowIndex < params.rows.length; rowIndex += 1) {
		const row = params.rows[rowIndex];
		parsed.push({
			sourceType: params.sourceType,
			sourcePath: params.csvPath,
			sourceRowNumber: rowIndex + 2,
			alias: readCell(row, idx.alias),
			partnerOneName: readCell(row, idx.partnerOneName),
			roleTitle: readCell(row, idx.roleTitle),
			solutionArea: readCell(row, idx.solutionArea),
			region: readCell(row, idx.region),
		});
	}

	return parsed;
}
