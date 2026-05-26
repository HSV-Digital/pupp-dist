import { describe, expect, it } from 'vitest';
import { SkuCategory } from '@repo/types';
import {
	COLUMN_MAP,
	normalizeRow,
	parseFile,
	validateHeaders,
} from './data-parser';

const TD_HEADERS = [
	'TPID',
	'Top Parent Name',
	'Subscription ID',
	'Subscription End Date',
	'Expiration Ending Product',
	'Expiration Ending Seats',
	'Reseller Name (From)',
	'Distributor Name (From)',
	'CSP Annualized Expiring Revenue',
	'Copilot Flag (CSP)',
];

const LEGACY_HEADERS = [
	'Customer ID',
	'Customer Name',
	'Subscription ID',
	'Renewal Date',
	'Current Product',
	'Seat Count',
	'Reseller Name',
	'Distributor Name',
	'Annual Revenue Run Rate',
];

describe('validateHeaders', () => {
	it('accepts TD-Synnex required headers', () => {
		expect(validateHeaders(TD_HEADERS)).toEqual([]);
	});

	it('accepts legacy alias headers for required fields', () => {
		expect(validateHeaders(LEGACY_HEADERS)).toEqual([]);
	});

	it('reports missing required headers', () => {
		const missing = validateHeaders(['TPID', 'Subscription ID']);
		expect(missing).toContain('Top Parent Name');
		expect(missing).toContain('Expiration Ending Product');
		expect(missing.length).toBeGreaterThan(0);
	});
});

describe('normalizeRow', () => {
	const headerToField = new Map(
		TD_HEADERS.map((header) => [header, COLUMN_MAP[header]] as const),
	);

	function makeTdRow(
		overrides: Record<string, string> = {},
	): Record<string, string> {
		return {
			TPID: ' 51927626 ',
			'Top Parent Name': 'Cornerstone Of Recovery',
			'Subscription ID': 'ac759e65-4e9e-47ba-cee0-f4aa665593a6',
			'Subscription End Date': '01/11/2026',
			'Expiration Ending Product': 'O365 - M365 E3 FUSL',
			'Expiration Ending Seats': '2,127',
			'Reseller Name (From)': 'Micropulse Technologies',
			'Distributor Name (From)': 'TD-Synnex',
			'CSP Annualized Expiring Revenue': '$7,35,091',
			'Copilot Flag (CSP)': 'Yes',
			...overrides,
		};
	}

	it('normalizes TD-Synnex fields correctly', () => {
		const { data, error } = normalizeRow(makeTdRow(), 0, headerToField);

		expect(error).toBeUndefined();
		expect(data).toBeDefined();
		expect(data?.customerId).toBe('51927626');
		expect(data?.customerName).toBe('Cornerstone Of Recovery');
		expect(data?.seatCount).toBe(2127);
		expect(data?.annualRevenueRunRate).toBe(735091);
		expect(data?.renewalDate).toBe('2026-01-11');
		expect(data?.hasCopilot).toBe(true);
		expect(data?.termMonths).toBe(12);
		expect(data?.autoRenew).toBe(false);
		expect(data?.skuCategory).toBe(SkuCategory.E3);
	});

	it('returns row-level error for missing TPID', () => {
		const { data, error } = normalizeRow(
			makeTdRow({ TPID: '   ' }),
			3,
			headerToField,
		);

		expect(data).toBeUndefined();
		expect(error).toBe('Row 4: missing customerId');
	});

	it('normalizes bad numeric inputs to 0', () => {
		const { data } = normalizeRow(
			makeTdRow({
				'Expiration Ending Seats': 'bad',
				'CSP Annualized Expiring Revenue': 'bad',
			}),
			0,
			headerToField,
		);

		expect(data?.seatCount).toBe(0);
		expect(data?.annualRevenueRunRate).toBe(0);
	});
});

describe('parseFile', () => {
	it('parses TD-Synnex CSV format end-to-end', async () => {
		const csv = [
			TD_HEADERS.join(','),
			'51927626,Cornerstone Of Recovery,sub-001,01/11/2026,O365 - M365 E3 FUSL,"2,127",Micropulse Technologies,TD-Synnex,"$7,35,091",Yes',
			'11850049,BBB Industries,sub-002,02/28/2026,O365 Plan E3,"2,509",MicroAge,TD-Synnex,"$6,13,343",No',
		].join('\n');

		const file = new File([csv], 'td-synnex.csv', { type: 'text/csv' });
		const { data, result } = await parseFile(file);

		expect(result.successful).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.errors).toEqual([]);
		expect(data[0].customerId).toBe('51927626');
		expect(data[1].customerId).toBe('11850049');
		expect(data[1].hasCopilot).toBe(false);
	});

	it('skips invalid rows and reports row-level errors', async () => {
		const csv = [
			TD_HEADERS.join(','),
			',Cornerstone Of Recovery,sub-001,01/11/2026,O365 - M365 E3 FUSL,"2,127",Micropulse Technologies,TD-Synnex,"$7,35,091",Yes',
		].join('\n');

		const file = new File([csv], 'td-synnex.csv', { type: 'text/csv' });
		const { data, result } = await parseFile(file);

		expect(data).toHaveLength(0);
		expect(result.successful).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.errors[0]).toContain('missing customerId');
	});

	it('returns header validation errors for invalid schema', async () => {
		const csv = 'Bad Header,Another Header\n1,2\n';
		const file = new File([csv], 'bad.csv', { type: 'text/csv' });
		const { data, result } = await parseFile(file);

		expect(data).toHaveLength(0);
		expect(result.successful).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.errors[0]).toContain('Missing columns');
	});
});
