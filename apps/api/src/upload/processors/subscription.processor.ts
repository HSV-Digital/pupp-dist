import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { externalSubscriptions } from '../../database/schema';
import type { MappedRow, SourceType, UploadSource } from '../upload.types';
import { SUBSCRIPTION_DEDUP } from '../dedup-config';

interface SubscriptionResult {
	flagged: boolean;
	created: boolean;
	candidateIds?: string[];
	detail?: string;
}

export interface RenewalBatchRowOutcome {
	accepted: boolean;
	flagged: boolean;
	candidateIds?: string[];
	detail?: string;
}

/**
 * Strips common Microsoft product prefixes so that names from different
 * source files resolve to the same canonical form.
 *
 *   "O365 - M365 Business Basic"   → "business basic"
 *   "Microsoft 365 Business Basic" → "business basic"
 *   "M365 Business Basic"          → "business basic"
 */
function normalizeSubscriptionName(value: string | undefined): string | null {
	if (!value) return null;
	let name = value.trim().toLowerCase();
	const prefixes = ['o365 - ', 'microsoft 365 ', 'm365 ', 'office 365 '];

	let stripped = true;
	while (stripped) {
		stripped = false;
		for (const prefix of prefixes) {
			if (name.startsWith(prefix)) {
				name = name.slice(prefix.length);
				stripped = true;
				break;
			}
		}
	}
	return name || null;
}

/** Treat null, undefined, and empty string as "no value" */
function hasValue(v: unknown): v is string {
	return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Checks whether the partner identity from an incoming row is "compatible"
 * with an existing DB record.
 *
 * Rules (applied per identifier type — globalId, oneId, name):
 *  1. Both sides have a non-null value AND values match  → same partner
 *  2. Both sides have a non-null value AND values differ → different partner
 *  3. Either side is null/empty                          → unknown for this type
 *
 * Overall result:
 *  - If ANY type says "same partner"      → compatible (enrich)
 *  - If ANY type says "different partner"
 *    AND no type says "same partner"       → NOT compatible (new record)
 *  - If ALL types are "unknown"            → compatible (fallback to customer
 *    & other common fields — can't tell)
 */
function partnersAreCompatible(row: MappedRow, record: any): boolean {
	let anySame = false;
	let anyDifferent = false;

	// globalId
	if (hasValue(row.partnerGlobalId) && hasValue(record.partnerGlobalId)) {
		if (row.partnerGlobalId === record.partnerGlobalId) anySame = true;
		else anyDifferent = true;
	}

	// oneId
	if (hasValue(row.mpnId) && hasValue(record.mpnId)) {
		if (row.mpnId === record.mpnId) anySame = true;
		else anyDifferent = true;
	}

	// name (case-insensitive)
	if (hasValue(row.partnerName) && hasValue(record.partnerName)) {
		if (
			row.partnerName!.trim().toLowerCase() ===
			record.partnerName.trim().toLowerCase()
		)
			anySame = true;
		else anyDifferent = true;
	}

	// If any identifier positively matched → same partner
	if (anySame) return true;

	// If any identifier positively mismatched (and none matched) → different
	if (anyDifferent) return false;

	// All identifier comparisons were skipped because one or both sides
	// were null → we simply can't tell. Fallback: treat as compatible
	// and rely on customer + subscription name match to avoid duplicates.
	return true;
}

function sourceTypeToUploadSource(sourceType: SourceType): UploadSource {
	if (
		sourceType === 'RENEWAL_MICROSOFT' ||
		sourceType === 'CLAS_MICROSOFT'
	) {
		return 'microsoft';
	}
	if (sourceType === 'RENEWAL_PARTNER' || sourceType === 'CLAS_PARTNER') {
		return 'partner_center_upload';
	}
	return 'csv';
}

// ─────────────────────────────────────────────────────────────────────
//  Main entry point
// ─────────────────────────────────────────────────────────────────────

export async function processSubscription(
	row: MappedRow,
	sourceType: SourceType,
	orgId: string,
	createdBy: string,
	db: any,
): Promise<SubscriptionResult> {
	const rule = SUBSCRIPTION_DEDUP[sourceType];
	const isClas = rule.subscription.length === 0;
	const uploadSource = sourceTypeToUploadSource(sourceType);

	// ── Step 1: Fetch candidates by customer + orgId ─────────────
	const conditions: any[] = [eq(externalSubscriptions.orgId, orgId)];

	if (rule.customer.includes('customerTpid') && row.customerTpid) {
		if (row.accountName) {
			conditions.push(
				sql`(${externalSubscriptions.customerTpid} = ${row.customerTpid}
				  OR (${externalSubscriptions.customerTpid} IS NULL
				      AND lower(trim(${externalSubscriptions.accountName})) = ${row.accountName.trim().toLowerCase()}))`,
			);
		} else {
			conditions.push(
				eq(externalSubscriptions.customerTpid, row.customerTpid),
			);
		}
	} else if (rule.customer.includes('accountName') && row.accountName) {
		conditions.push(
			eq(
				sql`lower(trim(${externalSubscriptions.accountName}))`,
				row.accountName.trim().toLowerCase(),
			),
		);
	} else {
		// No usable customer identity → just create
		if (!rule.canCreate) return { flagged: false, created: false };
		return await insertNew(row, orgId, uploadSource, isClas, createdBy, db);
	}

	const candidateRecords = await db
		.select()
		.from(externalSubscriptions)
		.where(and(...conditions));

	// ── Step 2: Filter in JS by subscription name + partner ──────

	if (isClas) {
		// CLAS: no subscription identity → match customer + partner only
		const matches = candidateRecords.filter((r: any) =>
			partnersAreCompatible(row, r),
		);

		if (matches.length > 0) {
			for (const record of matches) {
				await enrichClas(row, record, db);
			}
			return { flagged: false, created: false };
		}

		if (!rule.canCreate) return { flagged: false, created: false };
		return await insertNew(row, orgId, uploadSource, true, createdBy, db);
	}

	// Non-CLAS: match by normalized subscription name + partner
	const incomingNormalized = normalizeSubscriptionName(row.subscriptionName);
	const partnerCompatible = candidateRecords.filter((r: any) =>
		partnersAreCompatible(row, r),
	);

	let matches = incomingNormalized
		? partnerCompatible.filter(
				(r: any) =>
					normalizeSubscriptionName(r.subscriptionName) === incomingNormalized,
			)
		: [];

	// Fallback: a renewal lands on top of a CLAS-only stub (no subscription
	// name yet) → claim the stub so the renewal enriches it instead of
	// creating a duplicate row.
	if (matches.length === 0) {
		matches = partnerCompatible.filter((r: any) => !hasValue(r.subscriptionName));
	}

	if (matches.length === 0) {
		if (!rule.canCreate) return { flagged: false, created: false };
		// Renewal insert: backfill empty CLAS attribute columns from the
		// customer's existing rows (any sibling subscription's most-recent
		// non-null value).
		return await insertNew(
			row,
			orgId,
			uploadSource,
			false,
			createdBy,
			db,
			candidateRecords,
		);
	}

	if (matches.length === 1) {
		await enrichRenewal(row, matches[0], db);
		return { flagged: false, created: false };
	}

	return {
		flagged: true,
		created: false,
		candidateIds: matches.map((r: any) => r.id),
		detail: `Multiple subscriptions match for "${row.accountName}" - "${row.subscriptionName}"`,
	};
}

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * CLAS attribute columns that can be backfilled onto a freshly-inserted
 * Renewal row from any sibling subscription belonging to the same customer.
 */
const CLAS_BACKFILL_COLUMNS = [
	'distributorName',
	'distributorId',
	'partnerName',
	'partnerGlobalId',
	'mpnId',
	'customerTpid',
	'countryName',
	'copilotFit',
	'copilotIntent',
	'copilotCluster',
	'mwCspAnnualRenewal',
	'mwPaidSeatRange',
	'hasTransactedProduct',
	'hasCompete',
	'tenantIds',
	'dominantSkuGroup',
] as const;

/**
 * For each backfill column, take the most recent non-null value across the
 * provided sibling records. Returns a partial map; callers use it to fill
 * empty fields before insert.
 */
function buildClasBackfill(
	siblings: any[] | undefined,
): Record<string, unknown> {
	if (!siblings || siblings.length === 0) return {};
	const sorted = [...siblings].sort((a, b) => {
		const ad = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
		const bd = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
		return bd - ad;
	});
	const out: Record<string, unknown> = {};
	for (const col of CLAS_BACKFILL_COLUMNS) {
		for (const sib of sorted) {
			const v = sib[col];
			if (v !== null && v !== undefined && v !== '') {
				out[col] = v;
				break;
			}
		}
	}
	return out;
}

async function insertNew(
	row: MappedRow,
	orgId: string,
	source: UploadSource,
	isClas: boolean,
	createdBy: string,
	db: any,
	siblingRecords?: any[],
): Promise<SubscriptionResult> {
	// Renewal-side: pull CLAS attributes from the customer's other rows so
	// the new subscription carries the same enrichment state.
	const backfill = isClas ? {} : buildClasBackfill(siblingRecords);

	const pick = <K extends keyof MappedRow>(
		key: K,
		dbCol?: string,
	): MappedRow[K] | unknown | null => {
		const fromRow = row[key];
		if (fromRow !== undefined && fromRow !== null && fromRow !== '') {
			return fromRow;
		}
		const fromBackfill = backfill[dbCol ?? (key as string)];
		return fromBackfill ?? null;
	};

	// CLAS visibility rule: hidden iff both bounds of Org Size strictly
	// exceed 300. Renewal/inserts default visible.
	const dashboardVisible =
		!isClas ||
		!row.orgSizeRange ||
		row.orgSizeRange.lower <= 300 ||
		row.orgSizeRange.upper <= 300;

	await db.insert(externalSubscriptions).values({
		id: randomUUID(),
		orgId,
		source,
		distributorName: pick('distributorName'),
		distributorId: pick('distributorId'),
		partnerName: pick('partnerName'),
		partnerGlobalId: pick('partnerGlobalId'),
		mpnId: pick('mpnId'),
		customerTpid: pick('customerTpid'),
		accountName: row.accountName ?? null,
		countryName: pick('countryName'),
		copilotFit: pick('copilotFit'),
		copilotIntent: pick('copilotIntent'),
		copilotCluster: pick('copilotCluster'),
		mwCspAnnualRenewal: pick('mwCspAnnualRenewal'),
		mwPaidSeatRange: pick('mwPaidSeatRange'),
		hasTransactedProduct: pick('hasTransactedProduct'),
		hasCompete: pick('hasCompete'),
		tenantIds: pick('tenantIds'),
		subscriptionName: isClas ? null : (row.subscriptionName ?? null),
		licensesCount: row.licensesCount ?? null,
		subscriptionEndDate: row.subscriptionEndDate ?? null,
		type: isClas ? null : (row.type ?? null),
		dashboardVisible,
		createdBy,
	});
	return { flagged: false, created: true };
}

async function enrichClas(
	row: MappedRow,
	record: any,
	db: any,
): Promise<void> {
	const updates: Record<string, any> = { updatedAt: new Date() };

	// CLAS is pure fill-empty-only — never overwrites existing data.
	if (row.copilotFit && !record.copilotFit) updates.copilotFit = row.copilotFit;
	if (row.copilotIntent && !record.copilotIntent)
		updates.copilotIntent = row.copilotIntent;
	if (row.copilotCluster && !record.copilotCluster)
		updates.copilotCluster = row.copilotCluster;
	if (row.mwCspAnnualRenewal && !record.mwCspAnnualRenewal)
		updates.mwCspAnnualRenewal = row.mwCspAnnualRenewal;
	if (row.mwPaidSeatRange && !record.mwPaidSeatRange)
		updates.mwPaidSeatRange = row.mwPaidSeatRange;
	if (row.hasTransactedProduct && !record.hasTransactedProduct)
		updates.hasTransactedProduct = row.hasTransactedProduct;
	if (row.hasCompete && !record.hasCompete) updates.hasCompete = row.hasCompete;
	if (row.tenantIds && !record.tenantIds) updates.tenantIds = row.tenantIds;
	if (row.licensesCount !== undefined && !record.licensesCount)
		updates.licensesCount = row.licensesCount;
	if (row.subscriptionEndDate && !record.subscriptionEndDate)
		updates.subscriptionEndDate = row.subscriptionEndDate;
	if (row.distributorName && !record.distributorName)
		updates.distributorName = row.distributorName;
	if (row.partnerName && !record.partnerName)
		updates.partnerName = row.partnerName;
	if (row.partnerGlobalId && !record.partnerGlobalId)
		updates.partnerGlobalId = row.partnerGlobalId;
	if (row.mpnId && !record.mpnId)
		updates.mpnId = row.mpnId;
	if (row.customerTpid && !record.customerTpid)
		updates.customerTpid = row.customerTpid;
	if (row.countryName && !record.countryName)
		updates.countryName = row.countryName;

	await db
		.update(externalSubscriptions)
		.set(updates)
		.where(eq(externalSubscriptions.id, record.id));
}

// ─────────────────────────────────────────────────────────────────────
//  Renewal Partner — per-customer batch processor
// ─────────────────────────────────────────────────────────────────────

/**
 * Columns copied from the "first DB row" onto inserts when a renewal
 * upload provides more rows than the customer currently has on file.
 * Excludes the renewal-mapper fields (subscription name, seats, end date,
 * partner globalId, mpnId) which come from the sheet row itself.
 */
const RENEWAL_BATCH_INSERT_CARRYOVER_COLUMNS = [
	'customerTpid',
	'countryName',
	'partnerName',
	'distributorName',
	'distributorId',
	'copilotFit',
	'copilotIntent',
	'copilotCluster',
	'copilotEligibleM365Seats',
	'freeCopilotChatMAU',
	'copilotMAUPercentage',
	'copilotSeatsWhitespace',
	'allAgentMAU',
	'mciEligibility',
	'mciEngagementName',
	'adoptionStatus',
	'mwCspAnnualRenewal',
	'mwPaidSeatRange',
	'hasTransactedProduct',
	'hasCompete',
	'tenantIds',
	'dominantSkuGroup',
	'type',
] as const;

function sortDbRowsByCreation(rows: any[]): any[] {
	return [...rows].sort((a, b) => {
		const at = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
		const bt = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
		if (at !== bt) return at - bt;
		return String(a.id ?? '').localeCompare(String(b.id ?? ''));
	});
}

async function overwriteRenewalRow(
	row: MappedRow,
	record: any,
	db: any,
): Promise<void> {
	const updates: Record<string, any> = { updatedAt: new Date() };

	if (hasValue(row.subscriptionName)) {
		updates.subscriptionName = row.subscriptionName;
	}
	if (row.licensesCount !== undefined && row.licensesCount !== null) {
		updates.licensesCount = row.licensesCount;
	}
	if (row.subscriptionEndDate) {
		updates.subscriptionEndDate = row.subscriptionEndDate;
	}
	if (hasValue(row.partnerGlobalId)) {
		updates.partnerGlobalId = row.partnerGlobalId;
	}
	if (hasValue(row.mpnId)) {
		updates.mpnId = row.mpnId;
	}

	const finalSubscriptionName =
		updates.subscriptionName ?? record.subscriptionName;
	const finalLicensesCount =
		updates.licensesCount ?? record.licensesCount;
	if (
		!record.dashboardVisible &&
		hasValue(finalSubscriptionName) &&
		finalLicensesCount != null
	) {
		updates.dashboardVisible = true;
	}

	await db
		.update(externalSubscriptions)
		.set(updates)
		.where(eq(externalSubscriptions.id, record.id));
}

async function insertRenewalRowWithCarryover(
	row: MappedRow,
	carryover: any,
	orgId: string,
	createdBy: string,
	db: any,
): Promise<void> {
	const values: Record<string, any> = {
		id: randomUUID(),
		orgId,
		source: sourceTypeToUploadSource('RENEWAL_PARTNER'),
		accountName: row.accountName ?? carryover.accountName ?? null,
		subscriptionName: row.subscriptionName ?? null,
		licensesCount: row.licensesCount ?? null,
		subscriptionEndDate: row.subscriptionEndDate ?? null,
		partnerGlobalId: hasValue(row.partnerGlobalId)
			? row.partnerGlobalId
			: (carryover.partnerGlobalId ?? null),
		mpnId: hasValue(row.mpnId) ? row.mpnId : (carryover.mpnId ?? null),
		dashboardVisible: true,
		createdBy,
	};

	for (const col of RENEWAL_BATCH_INSERT_CARRYOVER_COLUMNS) {
		const v = carryover[col];
		if (v !== null && v !== undefined && v !== '') {
			values[col] = v;
		}
	}

	await db.insert(externalSubscriptions).values(values);
}

/**
 * Processes a batch of `RENEWAL_PARTNER` rows that all belong to the same
 * customer.
 *
 * When the customer has at least one DB row with a non-empty
 * subscription_name ("valid SKU"), the batch is paired by ordinal position
 * with those DB rows (sorted by createdAt asc, id asc):
 *
 *   sheet=1, db=1   → overwrite the DB row
 *   sheet=N, db=1   → overwrite first; insert N-1 with CLAS/ASPX from
 *                     the first DB row
 *   sheet=N, db=M (M ≤ N) → overwrite each pair; insert N-M with CLAS/ASPX
 *                            from the first DB row
 *   sheet=1, db=M (M ≥ 2) → overwrite first; soft-delete the rest
 *
 * Otherwise (no valid-SKU row in DB), each sheet row falls through to the
 * existing per-row `processSubscription` path so CLAS-stub claiming and
 * the legacy enrichRenewal logic continue to apply.
 *
 * Returns one outcome per sheet row, in input order, so the caller can map
 * results back to the original raw rows for flagged-row recording.
 */
export async function processRenewalPartnerBatch(
	sheetRows: MappedRow[],
	orgId: string,
	createdBy: string,
	db: any,
): Promise<RenewalBatchRowOutcome[]> {
	if (sheetRows.length === 0) return [];

	const accountName = sheetRows[0].accountName;
	if (!hasValue(accountName)) {
		return await fallbackPerRow(sheetRows, orgId, createdBy, db);
	}

	const candidateRecords = await db
		.select()
		.from(externalSubscriptions)
		.where(
			and(
				eq(externalSubscriptions.orgId, orgId),
				eq(
					sql`lower(trim(${externalSubscriptions.accountName}))`,
					accountName.trim().toLowerCase(),
				),
			),
		);

	const partnerCompatible = candidateRecords.filter((r: any) =>
		partnersAreCompatible(sheetRows[0], r),
	);

	const validSkuDbRows = sortDbRowsByCreation(
		partnerCompatible.filter((r: any) => hasValue(r.subscriptionName)),
	);

	if (validSkuDbRows.length === 0) {
		return await fallbackPerRow(sheetRows, orgId, createdBy, db);
	}

	const firstDbRow = validSkuDbRows[0];
	const pairCount = Math.min(sheetRows.length, validSkuDbRows.length);

	for (let i = 0; i < pairCount; i++) {
		await overwriteRenewalRow(sheetRows[i], validSkuDbRows[i], db);
	}

	if (sheetRows.length > validSkuDbRows.length) {
		for (let i = pairCount; i < sheetRows.length; i++) {
			await insertRenewalRowWithCarryover(
				sheetRows[i],
				firstDbRow,
				orgId,
				createdBy,
				db,
			);
		}
	} else if (validSkuDbRows.length > sheetRows.length) {
		for (let j = pairCount; j < validSkuDbRows.length; j++) {
			await db
				.update(externalSubscriptions)
				.set({ dashboardVisible: false, updatedAt: new Date() })
				.where(eq(externalSubscriptions.id, validSkuDbRows[j].id));
		}
	}

	return sheetRows.map(() => ({ accepted: true, flagged: false }));
}

async function fallbackPerRow(
	sheetRows: MappedRow[],
	orgId: string,
	createdBy: string,
	db: any,
): Promise<RenewalBatchRowOutcome[]> {
	const outcomes: RenewalBatchRowOutcome[] = [];
	for (const row of sheetRows) {
		const result = await processSubscription(
			row,
			'RENEWAL_PARTNER',
			orgId,
			createdBy,
			db,
		);
		outcomes.push({
			accepted: !result.flagged,
			flagged: result.flagged,
			candidateIds: result.candidateIds,
			detail: result.detail,
		});
	}
	return outcomes;
}

async function enrichRenewal(
	row: MappedRow,
	record: any,
	db: any,
): Promise<void> {
	const updates: Record<string, any> = { updatedAt: new Date() };

	if (row.distributorName && !record.distributorName)
		updates.distributorName = row.distributorName;
	if (row.distributorId && !record.distributorId)
		updates.distributorId = row.distributorId;
	if (row.partnerName && !record.partnerName)
		updates.partnerName = row.partnerName;
	if (row.partnerGlobalId && !record.partnerGlobalId)
		updates.partnerGlobalId = row.partnerGlobalId;
	if (row.mpnId && !record.mpnId)
		updates.mpnId = row.mpnId;
	if (row.customerTpid && !record.customerTpid)
		updates.customerTpid = row.customerTpid;
	if (row.countryName && !record.countryName)
		updates.countryName = row.countryName;
	if (row.type && !record.type) updates.type = row.type;
	if (row.subscriptionName && !hasValue(record.subscriptionName))
		updates.subscriptionName = row.subscriptionName;
	if (row.licensesCount !== undefined) updates.licensesCount = row.licensesCount;
	if (row.subscriptionEndDate)
		updates.subscriptionEndDate = row.subscriptionEndDate;

	// Visibility: a CLAS-big-org or ASPX-hidden row becomes visible once it
	// has both a subscription name and a license count.
	const finalSubscriptionName =
		updates.subscriptionName ?? record.subscriptionName;
	const finalLicensesCount =
		updates.licensesCount ?? record.licensesCount;
	if (
		!record.dashboardVisible &&
		hasValue(finalSubscriptionName) &&
		finalLicensesCount != null
	) {
		updates.dashboardVisible = true;
	}

	await db
		.update(externalSubscriptions)
		.set(updates)
		.where(eq(externalSubscriptions.id, record.id));
}
