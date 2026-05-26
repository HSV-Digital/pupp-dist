import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
	masterDistributors,
	type MasterDistributorRow,
} from '../../database/schema';
import type { MappedRow, SourceType } from '../upload.types';
import { DISTRIBUTOR_DEDUP } from '../dedup-config';

/** Maps config field names to MappedRow keys and DB columns */
const FIELD_MAP = {
	distributorId: {
		rowKey: 'distributorId' as const,
		dbCol: masterDistributors.distributorId,
	},
	name: {
		rowKey: 'distributorName' as const,
		dbCol: masterDistributors.name,
	},
};

export async function processDistributor(
	row: MappedRow,
	sourceType: SourceType,
	db: any,
): Promise<void> {
	const rule = DISTRIBUTOR_DEDUP[sourceType];

	// Nothing to match on → skip
	if (rule.matchBy.length === 0) return;
	if (!row.distributorName && !row.distributorId) return;

	// Search for existing record using matchBy columns in priority order
	let existing: MasterDistributorRow | null = null;

	for (const field of rule.matchBy) {
		const { rowKey, dbCol } = FIELD_MAP[field];
		const value = row[rowKey];
		if (!value) continue;

		const results: MasterDistributorRow[] = await db
			.select()
			.from(masterDistributors)
			.where(eq(dbCol, value))
			.limit(1);

		if (results[0]) {
			existing = results[0];
			break;
		}
	}

	if (existing) {
		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (!existing.distributorId && row.distributorId)
			updates.distributorId = row.distributorId;
		if (!existing.name && row.distributorName)
			updates.name = row.distributorName;

		if (Object.keys(updates).length > 1) {
			await db
				.update(masterDistributors)
				.set(updates)
				.where(eq(masterDistributors.id, existing.id));
		}
	} else if (rule.canCreate) {
		await db.insert(masterDistributors).values({
			id: randomUUID(),
			distributorId: row.distributorId ?? null,
			name: row.distributorName ?? null,
		});
	}
}
