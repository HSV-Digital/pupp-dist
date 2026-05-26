import {
	buildDedupeKey,
	buildStableSubscriptionId,
	categorizeProduct,
	mapSubscriptionType,
	normalizeInteger,
	normalizeLookupValue,
	normalizeRegion,
	normalizeSourceAlias,
	parseCsvDate,
	parseCsvMoney,
	type PodMappingRow,
	type RawRenewalRow,
	type SourceType,
} from './csv-schema';

export type PodRoleId =
	| 'pdm_name'
	| 'pmm_name'
	| 'pss_ai_workforce_name'
	| 'pss_ai_security_name'
	| 'psa_name';

type MappingReason =
	| 'matched'
	| 'missing_lookup_key'
	| 'no_mapping'
	| 'ambiguous';

interface PodMappingRule {
	id: PodRoleId;
	label: string;
	sourceType: SourceType;
	roleTitles: string[];
	solutionAreas: string[] | null;
	partnerKey: 'resellerName' | 'distributorName';
}

interface MappingRuleIndex {
	rule: PodMappingRule;
	records: number;
	usableRecords: number;
	malformedRecords: number;
	lookupToAliases: Map<string, Set<string>>;
}

export interface MappingIndexStats {
	sourceType: SourceType;
	roleId: PodRoleId;
	label: string;
	records: number;
	usableRecords: number;
	malformedRecords: number;
	keys: number;
	ambiguousKeys: number;
}

export interface MappingDecision {
	sourceType: SourceType;
	roleId: PodRoleId;
	label: string;
	reason: MappingReason;
	mappedAlias: string;
	candidateAliases: string[];
	partnerLookupValue: string;
	regionLookupValue: string;
	sourcePath: string;
	sourceRowNumber: number;
	customerId: string;
	customerName: string;
}

export interface MappingRoleOutcomeStats {
	totalRows: number;
	matched: number;
	missingLookupKey: number;
	noMapping: number;
	ambiguous: number;
	blankWritten: number;
}

export interface MappingIssueSummary {
	sourceType: SourceType;
	roleId: PodRoleId;
	label: string;
	reason: Exclude<MappingReason, 'matched'>;
	partnerLookupValue: string;
	regionLookupValue: string;
	count: number;
	candidateAliases: string[];
	sample: {
		sourcePath: string;
		sourceRowNumber: number;
		customerId: string;
		customerName: string;
	};
}

export interface MappingDiagnostics {
	statsBySource: {
		direct: Record<PodRoleId, MappingRoleOutcomeStats>;
		indirect: Record<PodRoleId, MappingRoleOutcomeStats>;
	};
	indexStats: MappingIndexStats[];
	issues: MappingIssueSummary[];
}

export interface SeedSubscriptionRow {
	id: string;
	customer_id: string;
	subscription_id: string;
	customer_name: string;
	reseller_name: string;
	distributor_name: string;
	pss_ai_workforce_name: string;
	pss_ai_security_name: string;
	psa_name: string;
	pdm_name: string;
	pmm_name: string;
	current_product: string;
	type: string;
	sku_category: string;
	seat_count: number;
	annual_revenue_run_rate: number;
	renewal_date: string;
	term_months: number;
	auto_renew: boolean;
	multi_year: boolean;
	has_copilot: boolean;
	has_purview: boolean;
	has_sure_step: boolean;
	current_margin: number;
	customer_segment: string;
	region: string;
	notes: string;
}

export interface SeedCandidate {
	sourceType: SourceType;
	sourcePath: string;
	sourceRowNumber: number;
	row: SeedSubscriptionRow;
}

interface MappingIssueAccumulator extends MappingIssueSummary {}

const TOP_MAPPING_ISSUES = 40;

export function isRenewalDateStale(
	renewalDate: string,
	nowMs?: number,
): boolean {
	const now = nowMs ?? Date.now();
	const cutoff = new Date(now);
	cutoff.setDate(cutoff.getDate() - 60);
	const cutoffStr = cutoff.toISOString().slice(0, 10);
	return renewalDate < cutoffStr;
}

export const POD_MAPPING_RULES: ReadonlyArray<PodMappingRule> = [
	{
		id: 'pss_ai_security_name',
		label: 'PSS (AI Security)',
		sourceType: 'direct',
		roleTitles: ['PSS'],
		solutionAreas: ['AI SECURITY'],
		partnerKey: 'resellerName',
	},
	{
		id: 'pss_ai_workforce_name',
		label: 'PSS (AI Workforce)',
		sourceType: 'direct',
		roleTitles: ['PSS'],
		solutionAreas: ['AI WORKFORCE'],
		partnerKey: 'resellerName',
	},
	{
		id: 'pdm_name',
		label: 'PDM',
		sourceType: 'direct',
		roleTitles: ['PDM'],
		solutionAreas: null,
		partnerKey: 'resellerName',
	},
	{
		id: 'pmm_name',
		label: 'PMM',
		sourceType: 'direct',
		roleTitles: ['PMM'],
		solutionAreas: null,
		partnerKey: 'resellerName',
	},
	{
		id: 'psa_name',
		label: 'PSA (X-CSA)',
		sourceType: 'direct',
		roleTitles: ['X-CSA PSA', 'PSA'],
		solutionAreas: null,
		partnerKey: 'resellerName',
	},
	{
		id: 'pss_ai_security_name',
		label: 'PSS (AI Security)',
		sourceType: 'indirect',
		roleTitles: ['PSS'],
		solutionAreas: ['AI SECURITY'],
		partnerKey: 'distributorName',
	},
	{
		id: 'pss_ai_workforce_name',
		label: 'PSS (AI Workforce)',
		sourceType: 'indirect',
		roleTitles: ['PSS'],
		solutionAreas: ['AI WORKFORCE'],
		partnerKey: 'distributorName',
	},
	{
		id: 'pdm_name',
		label: 'PDM',
		sourceType: 'indirect',
		roleTitles: ['PDM'],
		solutionAreas: null,
		partnerKey: 'distributorName',
	},
	{
		id: 'pmm_name',
		label: 'PMM',
		sourceType: 'indirect',
		roleTitles: ['PMM'],
		solutionAreas: null,
		partnerKey: 'distributorName',
	},
	{
		id: 'psa_name',
		label: 'PSA (X-CSA)',
		sourceType: 'indirect',
		roleTitles: ['X-CSA PSA', 'PSA'],
		solutionAreas: null,
		partnerKey: 'distributorName',
	},
];

const ROLE_IDS: ReadonlyArray<PodRoleId> = [
	'pdm_name',
	'pmm_name',
	'pss_ai_workforce_name',
	'pss_ai_security_name',
	'psa_name',
];

function normalizeRoleTitle(value: string): string {
	return normalizeLookupValue(value);
}

function normalizeSolutionArea(value: string): string {
	return normalizeLookupValue(value);
}

function buildLookupKey(partnerValue: string, regionValue: string): string {
	return `${partnerValue}|${regionValue}`;
}

function createEmptyRoleStats(): MappingRoleOutcomeStats {
	return {
		totalRows: 0,
		matched: 0,
		missingLookupKey: 0,
		noMapping: 0,
		ambiguous: 0,
		blankWritten: 0,
	};
}

function createEmptyStatsBySource(): {
	direct: Record<PodRoleId, MappingRoleOutcomeStats>;
	indirect: Record<PodRoleId, MappingRoleOutcomeStats>;
} {
	return {
		direct: {
			pdm_name: createEmptyRoleStats(),
			pmm_name: createEmptyRoleStats(),
			pss_ai_workforce_name: createEmptyRoleStats(),
			pss_ai_security_name: createEmptyRoleStats(),
			psa_name: createEmptyRoleStats(),
		},
		indirect: {
			pdm_name: createEmptyRoleStats(),
			pmm_name: createEmptyRoleStats(),
			pss_ai_workforce_name: createEmptyRoleStats(),
			pss_ai_security_name: createEmptyRoleStats(),
			psa_name: createEmptyRoleStats(),
		},
	};
}

function buildIssueKey(decision: MappingDecision): string {
	return [
		decision.sourceType,
		decision.roleId,
		decision.reason,
		decision.partnerLookupValue || '(missing)',
		decision.regionLookupValue || '(missing)',
	].join('|');
}

function resolveIssueReason(
	reason: MappingReason,
): Exclude<MappingReason, 'matched'> | null {
	if (reason === 'matched') {
		return null;
	}
	return reason;
}

function createRuleIndex(rule: PodMappingRule): MappingRuleIndex {
	return {
		rule,
		records: 0,
		usableRecords: 0,
		malformedRecords: 0,
		lookupToAliases: new Map<string, Set<string>>(),
	};
}

function buildRuleIndexes(mappingRows: PodMappingRow[]): MappingRuleIndex[] {
	const ruleIndexes = POD_MAPPING_RULES.map((rule) => createRuleIndex(rule));

	for (const mappingRow of mappingRows) {
		for (const ruleIndex of ruleIndexes) {
			const { rule } = ruleIndex;
			if (mappingRow.sourceType !== rule.sourceType) {
				continue;
			}

			const normalizedRoleTitle = normalizeRoleTitle(mappingRow.roleTitle);
			if (!rule.roleTitles.includes(normalizedRoleTitle)) {
				continue;
			}
			if (rule.solutionAreas) {
				const normalizedSolution = normalizeSolutionArea(
					mappingRow.solutionArea,
				);
				if (!rule.solutionAreas.includes(normalizedSolution)) {
					continue;
				}
			}

			ruleIndex.records += 1;

			const alias = normalizeSourceAlias(mappingRow.alias);
			const partner = normalizeLookupValue(mappingRow.partnerOneName);
			const region = normalizeLookupValue(normalizeRegion(mappingRow.region));
			if (!alias || !partner || !region) {
				ruleIndex.malformedRecords += 1;
				continue;
			}

			ruleIndex.usableRecords += 1;
			const lookupKey = buildLookupKey(partner, region);
			const existing = ruleIndex.lookupToAliases.get(lookupKey);
			if (existing) {
				existing.add(alias);
				continue;
			}
			ruleIndex.lookupToAliases.set(lookupKey, new Set([alias]));
		}
	}

	return ruleIndexes;
}

export interface MappingIndexSet {
	ruleIndexes: MappingRuleIndex[];
	indexStats: MappingIndexStats[];
}

export function createMappingIndexSet(mappingRows: {
	direct: PodMappingRow[];
	indirect: PodMappingRow[];
}): MappingIndexSet {
	const combined = [...mappingRows.direct, ...mappingRows.indirect];
	const ruleIndexes = buildRuleIndexes(combined);

	const indexStats: MappingIndexStats[] = ruleIndexes.map((index) => {
		let ambiguousKeys = 0;
		for (const aliases of index.lookupToAliases.values()) {
			if (aliases.size > 1) {
				ambiguousKeys += 1;
			}
		}
		return {
			sourceType: index.rule.sourceType,
			roleId: index.rule.id,
			label: index.rule.label,
			records: index.records,
			usableRecords: index.usableRecords,
			malformedRecords: index.malformedRecords,
			keys: index.lookupToAliases.size,
			ambiguousKeys,
		};
	});

	return {
		ruleIndexes,
		indexStats,
	};
}

function resolveMappingDecision(
	row: RawRenewalRow,
	ruleIndex: MappingRuleIndex,
): MappingDecision {
	const partnerLookupValue = normalizeLookupValue(
		ruleIndex.rule.partnerKey === 'resellerName'
			? row.resellerName
			: row.distributorName,
	);
	const regionLookupValue = normalizeLookupValue(
		normalizeRegion(row.region || row.subRegion),
	);

	if (!partnerLookupValue || !regionLookupValue) {
		return {
			sourceType: row.sourceType,
			roleId: ruleIndex.rule.id,
			label: ruleIndex.rule.label,
			reason: 'missing_lookup_key',
			mappedAlias: '',
			candidateAliases: [],
			partnerLookupValue,
			regionLookupValue,
			sourcePath: row.sourcePath,
			sourceRowNumber: row.sourceRowNumber,
			customerId: row.tpid.trim(),
			customerName: row.customerName.trim() || 'Unknown Customer',
		};
	}

	const lookupKey = buildLookupKey(partnerLookupValue, regionLookupValue);
	const aliases = ruleIndex.lookupToAliases.get(lookupKey);
	if (!aliases || aliases.size === 0) {
		return {
			sourceType: row.sourceType,
			roleId: ruleIndex.rule.id,
			label: ruleIndex.rule.label,
			reason: 'no_mapping',
			mappedAlias: '',
			candidateAliases: [],
			partnerLookupValue,
			regionLookupValue,
			sourcePath: row.sourcePath,
			sourceRowNumber: row.sourceRowNumber,
			customerId: row.tpid.trim(),
			customerName: row.customerName.trim() || 'Unknown Customer',
		};
	}

	const candidates = [...aliases].sort();
	if (candidates.length > 1) {
		return {
			sourceType: row.sourceType,
			roleId: ruleIndex.rule.id,
			label: ruleIndex.rule.label,
			reason: 'ambiguous',
			mappedAlias: '',
			candidateAliases: candidates,
			partnerLookupValue,
			regionLookupValue,
			sourcePath: row.sourcePath,
			sourceRowNumber: row.sourceRowNumber,
			customerId: row.tpid.trim(),
			customerName: row.customerName.trim() || 'Unknown Customer',
		};
	}

	return {
		sourceType: row.sourceType,
		roleId: ruleIndex.rule.id,
		label: ruleIndex.rule.label,
		reason: 'matched',
		mappedAlias: candidates[0],
		candidateAliases: candidates,
		partnerLookupValue,
		regionLookupValue,
		sourcePath: row.sourcePath,
		sourceRowNumber: row.sourceRowNumber,
		customerId: row.tpid.trim(),
		customerName: row.customerName.trim() || 'Unknown Customer',
	};
}

function collectMappingDiagnostics(
	decisions: MappingDecision[],
	indexStats: MappingIndexStats[],
): MappingDiagnostics {
	const statsBySource = createEmptyStatsBySource();
	const issueMap = new Map<string, MappingIssueAccumulator>();

	for (const decision of decisions) {
		const stats = statsBySource[decision.sourceType][decision.roleId];
		stats.totalRows += 1;

		switch (decision.reason) {
			case 'matched':
				stats.matched += 1;
				break;
			case 'missing_lookup_key':
				stats.missingLookupKey += 1;
				stats.blankWritten += 1;
				break;
			case 'no_mapping':
				stats.noMapping += 1;
				stats.blankWritten += 1;
				break;
			case 'ambiguous':
				stats.ambiguous += 1;
				stats.blankWritten += 1;
				break;
			default:
				throw new Error(`Unsupported mapping reason: ${decision.reason}`);
		}

		const issueReason = resolveIssueReason(decision.reason);
		if (!issueReason) {
			continue;
		}

		const key = buildIssueKey(decision);
		const existing = issueMap.get(key);
		if (existing) {
			existing.count += 1;
			continue;
		}

		issueMap.set(key, {
			sourceType: decision.sourceType,
			roleId: decision.roleId,
			label: decision.label,
			reason: issueReason,
			partnerLookupValue: decision.partnerLookupValue || '(missing)',
			regionLookupValue: decision.regionLookupValue || '(missing)',
			count: 1,
			candidateAliases: decision.candidateAliases,
			sample: {
				sourcePath: decision.sourcePath,
				sourceRowNumber: decision.sourceRowNumber,
				customerId: decision.customerId,
				customerName: decision.customerName,
			},
		});
	}

	const issues = [...issueMap.values()]
		.sort((a, b) => b.count - a.count)
		.slice(0, TOP_MAPPING_ISSUES);

	return {
		statsBySource,
		indexStats,
		issues,
	};
}

export function mapRenewalRowsToSeedCandidates(params: {
	rows: RawRenewalRow[];
	mappingIndexSet: MappingIndexSet;
}): {
	candidates: SeedCandidate[];
	decisions: MappingDecision[];
	droppedStaleRows: RawRenewalRow[];
} {
	const candidates: SeedCandidate[] = [];
	const decisions: MappingDecision[] = [];
	const droppedStaleRows: RawRenewalRow[] = [];

	for (const row of params.rows) {
		const rowRuleIndexes = params.mappingIndexSet.ruleIndexes.filter(
			(index) => index.rule.sourceType === row.sourceType,
		);
		if (rowRuleIndexes.length !== ROLE_IDS.length) {
			throw new Error(
				`Expected ${ROLE_IDS.length} mapping rules for source "${row.sourceType}", got ${rowRuleIndexes.length}.`,
			);
		}

		const roleAliases: Record<PodRoleId, string> = {
			pdm_name: '',
			pmm_name: '',
			pss_ai_workforce_name: '',
			pss_ai_security_name: '',
			psa_name: '',
		};

		for (const ruleIndex of rowRuleIndexes) {
			const decision = resolveMappingDecision(row, ruleIndex);
			decisions.push(decision);
			if (decision.reason === 'matched') {
				roleAliases[ruleIndex.rule.id] = decision.mappedAlias;
			}
		}

		const customerId = row.tpid.trim();
		const customerName = row.customerName.trim() || 'Unknown Customer';
		const currentProduct = row.expirationEndingProduct.trim();
		if (!currentProduct) {
			throw new Error(
				`Missing Expiration Ending Product in ${row.sourceType} CSV row ${row.sourceRowNumber}.`,
			);
		}

		const resellerName = row.resellerName.trim();
		const distributorName = row.distributorName.trim();
		const distributorId = row.distributorId.trim();
		const renewalDate = parseCsvDate(row.subscriptionEndDate, {
			sourceType: row.sourceType,
			sourceRowNumber: row.sourceRowNumber,
		});
		const seatCount = normalizeInteger(row.expirationEndingSeats, 0);
		const annualRevenueRunRate = parseCsvMoney(
			row.cspAnnualizedExpiringRevenue,
		);
		const mappedType = mapSubscriptionType(row.type.trim());
		const rowIdentity = `${row.sourceType}|${row.sourceRowNumber}|${buildDedupeKey(
			{
				tpid: customerId,
				customerName,
				renewalDate,
				currentProduct,
				subscriptionType: mappedType,
				resellerName,
				distributorId,
				distributorName,
			},
		)}`;
		const subscriptionId = buildStableSubscriptionId(rowIdentity);
		const region = normalizeRegion(row.region || row.subRegion) || 'Unknown';

		if (isRenewalDateStale(renewalDate)) {
			droppedStaleRows.push(row);
			continue;
		}

		candidates.push({
			sourceType: row.sourceType,
			sourcePath: row.sourcePath,
			sourceRowNumber: row.sourceRowNumber,
			row: {
				id: subscriptionId,
				customer_id: customerId,
				subscription_id: subscriptionId,
				customer_name: customerName,
				reseller_name: resellerName,
				distributor_name: distributorName,
				pss_ai_workforce_name: roleAliases.pss_ai_workforce_name,
				pss_ai_security_name: roleAliases.pss_ai_security_name,
				psa_name: roleAliases.psa_name,
				pdm_name: roleAliases.pdm_name,
				pmm_name: roleAliases.pmm_name,
				current_product: currentProduct,
				type: mappedType,
				sku_category: categorizeProduct(currentProduct),
				seat_count: seatCount,
				annual_revenue_run_rate: annualRevenueRunRate,
				renewal_date: renewalDate,
				term_months: 12,
				auto_renew: false,
				multi_year: false,
				has_copilot: false,
				has_purview: false,
				has_sure_step: false,
				current_margin: 0,
				customer_segment: '',
				region,
				notes: '',
			},
		});
	}

	return { candidates, decisions, droppedStaleRows };
}

export function buildMappingDiagnostics(params: {
	decisions: MappingDecision[];
	mappingIndexSet: MappingIndexSet;
}): MappingDiagnostics {
	return collectMappingDiagnostics(
		params.decisions,
		params.mappingIndexSet.indexStats,
	);
}
