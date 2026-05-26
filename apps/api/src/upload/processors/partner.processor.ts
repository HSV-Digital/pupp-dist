import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { masterPartners, type MasterPartnerRow } from '../../database/schema';
import type { MappedRow, SourceType } from '../upload.types';
import { PARTNER_DEDUP } from '../dedup-config';

/** Maps config field names to MappedRow keys and DB columns */
const FIELD_MAP = {
	globalId: {
		rowKey: 'partnerGlobalId' as const,
		dbCol: masterPartners.globalId,
	},
	name: { rowKey: 'partnerName' as const, dbCol: masterPartners.name },
	mpnId: { rowKey: 'mpnId' as const, dbCol: masterPartners.mpnId },
};

export async function processPartner(
	row: MappedRow,
	sourceType: SourceType,
	db: any,
): Promise<void> {
	const rule = PARTNER_DEDUP[sourceType];

	// Nothing to match on → skip
	if (rule.matchBy.length === 0) return;
	if (!row.partnerName && !row.partnerGlobalId && !row.mpnId) return;

	// Search for existing record using matchBy columns in priority order
	let existing: MasterPartnerRow | null = null;

	for (const field of rule.matchBy) {
		const { rowKey, dbCol } = FIELD_MAP[field];
		const value = row[rowKey];
		if (!value) continue;

		const results: MasterPartnerRow[] = await db
			.select()
			.from(masterPartners)
			.where(eq(dbCol, value))
			.limit(1);

		if (results[0]) {
			existing = results[0];
			break;
		}
	}

	if (existing) {
		// Enrich existing record with any missing identifiers
		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (!existing.globalId && row.partnerGlobalId)
			updates.globalId = row.partnerGlobalId;
		if (!existing.name && row.partnerName) updates.name = row.partnerName;
		if (!existing.mpnId && row.mpnId) updates.mpnId = row.mpnId;

		if (Object.keys(updates).length > 1) {
			await db
				.update(masterPartners)
				.set(updates)
				.where(eq(masterPartners.id, existing.id));
		}
	} else if (rule.canCreate) {
		await db.insert(masterPartners).values({
			id: randomUUID(),
			globalId: row.partnerGlobalId ?? null,
			name: row.partnerName ?? null,
			mpnId: row.mpnId ?? null,
		});
	}
}
