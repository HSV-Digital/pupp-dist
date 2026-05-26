import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { masterCustomers } from '../../database/schema';
import type { MappedRow, SourceType } from '../upload.types';
import { CUSTOMER_DEDUP } from '../dedup-config';

interface CustomerResult {
	flagged: boolean;
	created: boolean;
	candidateIds?: string[];
	detail?: string;
}

export async function processCustomer(
	row: MappedRow,
	sourceType: SourceType,
	db: any,
): Promise<CustomerResult> {
	const rule = CUSTOMER_DEDUP[sourceType];

	if (!row.accountName) {
		return { flagged: false, created: false };
	}

	const normalizedName = row.accountName.trim().toLowerCase();

	// 1. Try TPID match first (if this source provides it)
	if (rule.matchBy.includes('customerTpid') && row.customerTpid) {
		const results = await db
			.select()
			.from(masterCustomers)
			.where(eq(masterCustomers.customerTpid, row.customerTpid))
			.limit(1);

		if (results.length > 0) {
			const existing = results[0];
			const updates: Record<string, any> = { updatedAt: new Date() };

			if (row.countryName) updates.countryName = row.countryName;
			if (row.accountName && row.accountName !== existing.customerName)
				updates.customerName = row.accountName;

			if (Object.keys(updates).length > 1) {
				await db
					.update(masterCustomers)
					.set(updates)
					.where(eq(masterCustomers.id, existing.id));
			}
			return { flagged: false, created: false };
		}
	}

	// 2. Try name match (if this source provides it)
	if (rule.matchBy.includes('accountName')) {
		const resultsByName = await db
			.select()
			.from(masterCustomers)
			.where(
				eq(
					sql`lower(trim(${masterCustomers.customerName}))`,
					normalizedName,
				),
			);

		if (resultsByName.length === 1) {
			const existing = resultsByName[0];
			const updates: Record<string, any> = { updatedAt: new Date() };

			if (row.customerTpid && !existing.customerTpid)
				updates.customerTpid = row.customerTpid;
			if (row.countryName) updates.countryName = row.countryName;

			if (Object.keys(updates).length > 1) {
				await db
					.update(masterCustomers)
					.set(updates)
					.where(eq(masterCustomers.id, existing.id));
			}
			return { flagged: false, created: false };
		}

		if (resultsByName.length > 1) {
			return {
				flagged: true,
				created: false,
				candidateIds: resultsByName.map((r: any) => r.id),
				detail: `Multiple customers match name "${row.accountName}"`,
			};
		}
	}

	// 3. No match — create if allowed
	if (rule.canCreate) {
		await db.insert(masterCustomers).values({
			id: randomUUID(),
			customerTpid: row.customerTpid ?? null,
			customerName: row.accountName,
			countryName: row.countryName ?? null,
		});
		return { flagged: false, created: true };
	}

	return { flagged: false, created: false };
}
