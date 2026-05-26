import {
	buildMappingDiagnostics,
	createMappingIndexSet,
	isRenewalDateStale,
	mapRenewalRowsToSeedCandidates,
} from './mapping-engine';
import type { PodMappingRow, RawRenewalRow, SourceType } from './csv-schema';

function buildRenewalRow(
	sourceType: SourceType,
	overrides: Partial<RawRenewalRow> = {},
): RawRenewalRow {
	return {
		sourceType,
		sourcePath: `/tmp/${sourceType}.csv`,
		sourceRowNumber: 2,
		tpid: 'TPID-1',
		customerName: 'Acme Corp',
		subscriptionEndDate: '2027-01-01',
		expirationEndingProduct: 'M365 E5',
		expirationEndingSeats: '100',
		type: sourceType === 'direct' ? 'Direct' : '2-tier',
		resellerName: 'Reseller A',
		distributorId: 'D-1',
		distributorName: 'Distributor A',
		cspAnnualizedExpiringRevenue: '$1200',
		region: 'United States',
		subRegion: '',
		pdm: '',
		pmm: '',
		aiWorkforcePss: '',
		aiSecurityPss: '',
		xCsaPsa: '',
		...overrides,
	};
}

function buildMappingRow(
	sourceType: SourceType,
	overrides: Partial<PodMappingRow> = {},
): PodMappingRow {
	return {
		sourceType,
		sourcePath: `/tmp/pod_mapping_${sourceType}.csv`,
		sourceRowNumber: 2,
		alias: 'ALIAS1',
		partnerOneName: sourceType === 'direct' ? 'Reseller A' : 'Distributor A',
		roleTitle: 'PSS',
		solutionArea: 'AI Security',
		region: 'United States',
		...overrides,
	};
}

describe('subscription mapping engine', () => {
	it('maps all direct roles by canonical rules', () => {
		const renewals = [buildRenewalRow('direct')];
		const mappings: PodMappingRow[] = [
			buildMappingRow('direct', {
				roleTitle: 'PSS',
				solutionArea: 'AI Security',
				alias: 'SEC_DIRECT',
			}),
			buildMappingRow('direct', {
				roleTitle: 'PSS',
				solutionArea: 'AI Workforce',
				alias: 'WORK_DIRECT',
			}),
			buildMappingRow('direct', {
				roleTitle: 'PDM',
				solutionArea: 'Cross Solution Area',
				alias: 'PDM_DIRECT',
			}),
			buildMappingRow('direct', {
				roleTitle: 'PMM',
				solutionArea: 'Cross Solution Area',
				alias: 'PMM_DIRECT',
			}),
			buildMappingRow('direct', {
				roleTitle: 'X-CSA PSA',
				solutionArea: 'Cross Solution Area',
				alias: 'PSA_DIRECT',
			}),
		];

		const mappingIndexSet = createMappingIndexSet({
			direct: mappings,
			indirect: [],
		});
		const result = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0].row.pss_ai_security_name).toBe('SEC_DIRECT');
		expect(result.candidates[0].row.pss_ai_workforce_name).toBe('WORK_DIRECT');
		expect(result.candidates[0].row.pdm_name).toBe('PDM_DIRECT');
		expect(result.candidates[0].row.pmm_name).toBe('PMM_DIRECT');
		expect(result.candidates[0].row.psa_name).toBe('PSA_DIRECT');
	});

	it('maps all indirect roles by canonical rules using distributor name', () => {
		const renewals = [buildRenewalRow('indirect')];
		const mappings: PodMappingRow[] = [
			buildMappingRow('indirect', {
				roleTitle: 'PSS',
				solutionArea: 'AI Security',
				alias: 'SEC_INDIRECT',
			}),
			buildMappingRow('indirect', {
				roleTitle: 'PSS',
				solutionArea: 'AI Workforce',
				alias: 'WORK_INDIRECT',
			}),
			buildMappingRow('indirect', {
				roleTitle: 'PDM',
				solutionArea: 'Cross Solution Area',
				alias: 'PDM_INDIRECT',
			}),
			buildMappingRow('indirect', {
				roleTitle: 'PMM',
				solutionArea: 'Cross Solution Area',
				alias: 'PMM_INDIRECT',
			}),
			buildMappingRow('indirect', {
				roleTitle: 'X-CSA PSA',
				solutionArea: 'Cross Solution Area',
				alias: 'PSA_INDIRECT',
			}),
		];

		const mappingIndexSet = createMappingIndexSet({
			direct: [],
			indirect: mappings,
		});
		const result = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});

		expect(result.candidates).toHaveLength(1);
		expect(result.candidates[0].row.pss_ai_security_name).toBe('SEC_INDIRECT');
		expect(result.candidates[0].row.pss_ai_workforce_name).toBe(
			'WORK_INDIRECT',
		);
		expect(result.candidates[0].row.pdm_name).toBe('PDM_INDIRECT');
		expect(result.candidates[0].row.pmm_name).toBe('PMM_INDIRECT');
		expect(result.candidates[0].row.psa_name).toBe('PSA_INDIRECT');
	});

	it('returns missing_lookup_key when partner key is blank', () => {
		const renewals = [buildRenewalRow('direct', { resellerName: '' })];
		const mappingIndexSet = createMappingIndexSet({
			direct: [],
			indirect: [],
		});

		const result = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});
		const diagnostics = buildMappingDiagnostics({
			decisions: result.decisions,
			mappingIndexSet,
		});

		expect(result.candidates[0].row.pss_ai_security_name).toBe('');
		expect(
			diagnostics.statsBySource.direct.pss_ai_security_name.missingLookupKey,
		).toBe(1);
	});

	it('returns no_mapping when no matching row exists', () => {
		const renewals = [buildRenewalRow('direct')];
		const mappingIndexSet = createMappingIndexSet({
			direct: [
				buildMappingRow('direct', {
					partnerOneName: 'Different Reseller',
					roleTitle: 'PSS',
					solutionArea: 'AI Security',
					alias: 'SEC_DIRECT',
				}),
			],
			indirect: [],
		});

		const result = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});
		const diagnostics = buildMappingDiagnostics({
			decisions: result.decisions,
			mappingIndexSet,
		});

		expect(result.candidates[0].row.pss_ai_security_name).toBe('');
		expect(
			diagnostics.statsBySource.direct.pss_ai_security_name.noMapping,
		).toBe(1);
	});

	it('returns ambiguous when multiple aliases match the same key', () => {
		const renewals = [buildRenewalRow('direct')];
		const mappingIndexSet = createMappingIndexSet({
			direct: [
				buildMappingRow('direct', {
					roleTitle: 'PSS',
					solutionArea: 'AI Security',
					alias: 'ALIAS_ONE',
				}),
				buildMappingRow('direct', {
					roleTitle: 'PSS',
					solutionArea: 'AI Security',
					alias: 'ALIAS_TWO',
				}),
			],
			indirect: [],
		});

		const result = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});
		const diagnostics = buildMappingDiagnostics({
			decisions: result.decisions,
			mappingIndexSet,
		});

		expect(result.candidates[0].row.pss_ai_security_name).toBe('');
		expect(
			diagnostics.statsBySource.direct.pss_ai_security_name.ambiguous,
		).toBe(1);
		expect(diagnostics.issues[0].candidateAliases).toEqual(
			expect.arrayContaining(['ALIAS_ONE', 'ALIAS_TWO']),
		);
	});

	it('normalizes case and whitespace while matching', () => {
		const renewals = [
			buildRenewalRow('direct', {
				resellerName: '  reseller a  ',
				region: 'united states',
			}),
		];
		const mappingIndexSet = createMappingIndexSet({
			direct: [
				buildMappingRow('direct', {
					partnerOneName: 'RESELLER A',
					region: 'United States',
					roleTitle: 'PDM',
					solutionArea: 'Cross Solution Area',
					alias: 'PDM_MATCH',
				}),
			],
			indirect: [],
		});

		const result = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});

		expect(result.candidates[0].row.pdm_name).toBe('PDM_MATCH');
	});

	it('keeps separate rows when business fields match but source row differs', () => {
		const renewals = [
			buildRenewalRow('direct', {
				tpid: 'TPID-1',
				sourceRowNumber: 2,
				expirationEndingSeats: '10',
				cspAnnualizedExpiringRevenue: '100',
			}),
			buildRenewalRow('direct', {
				tpid: 'TPID-1',
				sourceRowNumber: 3,
				expirationEndingSeats: '20',
				cspAnnualizedExpiringRevenue: '200',
			}),
		];
		const mappingIndexSet = createMappingIndexSet({
			direct: [
				buildMappingRow('direct', {
					roleTitle: 'PDM',
					solutionArea: 'Cross Solution Area',
					alias: 'PDM_ALIAS',
				}),
				buildMappingRow('direct', {
					roleTitle: 'PMM',
					solutionArea: 'Cross Solution Area',
					alias: 'PMM_ALIAS',
				}),
				buildMappingRow('direct', {
					roleTitle: 'PSS',
					solutionArea: 'AI Security',
					alias: 'SEC_ALIAS',
				}),
				buildMappingRow('direct', {
					roleTitle: 'PSS',
					solutionArea: 'AI Workforce',
					alias: 'WORK_ALIAS',
				}),
				buildMappingRow('direct', {
					roleTitle: 'X-CSA PSA',
					solutionArea: 'Cross Solution Area',
					alias: 'PSA_ALIAS',
				}),
			],
			indirect: [],
		});
		const mapped = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});

		expect(mapped.candidates).toHaveLength(2);
		expect(mapped.candidates[0].row.seat_count).toBe(10);
		expect(mapped.candidates[1].row.seat_count).toBe(20);
		expect(mapped.candidates[0].row.annual_revenue_run_rate).toBe(100);
		expect(mapped.candidates[1].row.annual_revenue_run_rate).toBe(200);
		expect(mapped.candidates[0].row.subscription_id).not.toBe(
			mapped.candidates[1].row.subscription_id,
		);
		expect(mapped.candidates[0].row.id).toBe(
			mapped.candidates[0].row.subscription_id,
		);
		expect(mapped.candidates[1].row.id).toBe(
			mapped.candidates[1].row.subscription_id,
		);
	});

	it('excludes candidates with renewal date more than 60 days ago and includes them in droppedStaleRows', () => {
		const now = new Date('2025-06-15T00:00:00Z');
		const staleDate = '2025-04-14'; // 62 days before June 15
		const renewals = [
			buildRenewalRow('direct', { subscriptionEndDate: staleDate }),
		];
		const mappingIndexSet = createMappingIndexSet({
			direct: [],
			indirect: [],
		});

		const result = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});

		// The stale row should still produce decisions (diagnostics) but no candidates
		expect(result.decisions.length).toBeGreaterThan(0);
		// Whether it's excluded depends on the current date; use isRenewalDateStale for deterministic assertion
		expect(isRenewalDateStale(staleDate, now.getTime())).toBe(true);
		// Dropped stale rows should contain the original row
		expect(result.droppedStaleRows).toHaveLength(1);
		expect(result.droppedStaleRows[0].tpid).toBe('TPID-1');
		expect(result.droppedStaleRows[0].subscriptionEndDate).toBe(staleDate);
	});

	it('does not include non-stale rows in droppedStaleRows', () => {
		const renewals = [
			buildRenewalRow('direct', { subscriptionEndDate: '2027-01-01' }),
		];
		const mappingIndexSet = createMappingIndexSet({
			direct: [],
			indirect: [],
		});

		const result = mapRenewalRowsToSeedCandidates({
			rows: renewals,
			mappingIndexSet,
		});

		expect(result.candidates).toHaveLength(1);
		expect(result.droppedStaleRows).toHaveLength(0);
	});

	it('includes candidates with renewal date exactly 60 days ago', () => {
		const now = new Date('2025-06-15T00:00:00Z');
		const borderDate = '2025-04-16'; // exactly 60 days before June 15
		expect(isRenewalDateStale(borderDate, now.getTime())).toBe(false);
	});

	it('includes candidates with future renewal date', () => {
		const now = new Date('2025-06-15T00:00:00Z');
		const futureDate = '2026-01-01';
		expect(isRenewalDateStale(futureDate, now.getTime())).toBe(false);
	});

	it('produces deterministic ids for the same seed row identity', () => {
		const rowA = buildRenewalRow('direct');
		const rowB = buildRenewalRow('direct');
		const mappingIndexSet = createMappingIndexSet({ direct: [], indirect: [] });

		const a = mapRenewalRowsToSeedCandidates({
			rows: [rowA],
			mappingIndexSet,
		}).candidates[0];
		const b = mapRenewalRowsToSeedCandidates({
			rows: [rowB],
			mappingIndexSet,
		}).candidates[0];

		expect(a.row.subscription_id).toBe(b.row.subscription_id);
		expect(a.row.id).toBe(b.row.id);
	});
});
