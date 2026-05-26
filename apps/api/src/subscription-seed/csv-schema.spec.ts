import {
	buildStableSubscriptionId,
	parsePodMappingRowsFromParsedCsv,
	parseRenewalRowsFromParsedCsv,
} from './csv-schema';

describe('subscription csv schema parsing', () => {
	it('parses renewals rows using header aliases', () => {
		const headers = [
			'TPID',
			'Top Parent Name',
			'Subscription End Date',
			'Expiration Ending Product',
			'Expiration Ending Seats',
			'Type',
			'Reseller Name (From)',
			'Distributor Name (From)',
			'CSP Annualized Expiring Revenue',
			'Area',
			'SubRegion',
			'PDM',
			'PMM',
			'AI Workforce PSS',
			'AI Security PSS',
			'X-CSA PSA',
		];

		const rows = [
			[
				'123',
				'Acme Corp',
				'1/2/2027',
				'M365 E5',
				'10',
				'Direct',
				'Reseller A',
				'Distributor A',
				'$1000',
				'United States',
				'NA',
				'PDM_ALIAS',
				'PMM_ALIAS',
				'WORK_ALIAS',
				'SEC_ALIAS',
				'PSA_ALIAS',
			],
		];

		const parsed = parseRenewalRowsFromParsedCsv({
			sourceType: 'direct',
			csvPath: '/tmp/direct.csv',
			headers,
			rows,
		});

		expect(parsed).toHaveLength(1);
		expect(parsed[0].customerName).toBe('Acme Corp');
		expect(parsed[0].region).toBe('United States');
		expect(parsed[0].pdm).toBe('PDM_ALIAS');
	});

	it('parses pod mapping rows using solution area header aliases', () => {
		const headers = [
			'Alias',
			'PartnerOneName',
			'Role Title',
			'Cloud Solution Area',
			'Region',
		];
		const rows = [
			['USER1', 'Reseller A', 'PSS', 'AI Security', 'United States'],
		];

		const parsed = parsePodMappingRowsFromParsedCsv({
			sourceType: 'direct',
			csvPath: '/tmp/mapping.csv',
			headers,
			rows,
		});

		expect(parsed).toHaveLength(1);
		expect(parsed[0].alias).toBe('USER1');
		expect(parsed[0].solutionArea).toBe('AI Security');
	});

	it('throws when renewals CSV is missing required header', () => {
		const headers = ['TPID', 'Customer Name'];
		const rows: string[][] = [];

		expect(() =>
			parseRenewalRowsFromParsedCsv({
				sourceType: 'direct',
				csvPath: '/tmp/direct.csv',
				headers,
				rows,
			}),
		).toThrow('missing required header');
	});

	it('throws when mapping CSV is missing required region header', () => {
		const headers = ['Alias', 'PartnerOneName', 'Role Title', 'Solution Area'];
		const rows: string[][] = [];

		expect(() =>
			parsePodMappingRowsFromParsedCsv({
				sourceType: 'indirect',
				csvPath: '/tmp/mapping.csv',
				headers,
				rows,
			}),
		).toThrow('missing required header');
	});

	it('builds deterministic stable ids for the same identity input', () => {
		const identity = 'direct|2|tpid-1|acme corp';
		const a = buildStableSubscriptionId(identity);
		const b = buildStableSubscriptionId(identity);

		expect(a).toBe(b);
		expect(a).toMatch(/^sub_[a-f0-9]{24}$/);
	});

	it('builds different stable ids for different identity input', () => {
		const a = buildStableSubscriptionId('direct|2|tpid-1|acme corp');
		const b = buildStableSubscriptionId('direct|3|tpid-1|acme corp');

		expect(a).not.toBe(b);
	});
});
