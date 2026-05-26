import { and, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import {
	externalSubscriptions,
	masterCustomers,
	masterPartners,
	masterDistributors,
} from '../../database/schema';

/**
 * Runs after every upload job completes.
 *
 * Scans external_subscriptions for the given org and backfills missing
 * identifiers by looking them up in the master tables:
 *
 *   - Has accountName but no customerTpid   → look up master_customer by name → fill TPID
 *   - Has customerTpid but no accountName   → look up master_customer by TPID → fill name
 *   - Has partnerName but no partnerGlobalId → look up master_partner by name → fill globalId, mpnId
 *   - Has partnerGlobalId but no partnerName → look up master_partner by globalId → fill name, mpnId
 *   - Has distributorName but no distributorId → look up master_distributor by name → fill ID
 *   - Has distributorId but no distributorName → look up master_distributor by ID → fill name
 */
export async function postUploadEnrich(
	orgId: string,
	db: any,
): Promise<{ enrichedCount: number }> {
	let enrichedCount = 0;

	// ── 1. Customer: accountName present, customerTpid missing ────
	const missingTpid = await db
		.select({
			id: externalSubscriptions.id,
			accountName: externalSubscriptions.accountName,
		})
		.from(externalSubscriptions)
		.where(
			and(
				eq(externalSubscriptions.orgId, orgId),
				isNotNull(externalSubscriptions.accountName),
				isNull(externalSubscriptions.customerTpid),
			),
		);

	for (const row of missingTpid) {
		const name = row.accountName?.trim().toLowerCase();
		if (!name) continue;

		const match = await db
			.select({
				customerTpid: masterCustomers.customerTpid,
				countryName: masterCustomers.countryName,
			})
			.from(masterCustomers)
			.where(
				and(
					isNotNull(masterCustomers.customerTpid),
					eq(
						sql`lower(trim(${masterCustomers.customerName}))`,
						name,
					),
				),
			)
			.limit(1);

		if (match[0]) {
			const updates: Record<string, any> = { updatedAt: new Date() };
			updates.customerTpid = match[0].customerTpid;
			if (match[0].countryName && !row.countryName)
				updates.countryName = match[0].countryName;

			await db
				.update(externalSubscriptions)
				.set(updates)
				.where(eq(externalSubscriptions.id, row.id));
			enrichedCount++;
		}
	}

	// ── 2. Customer: customerTpid present, accountName missing ───
	const missingName = await db
		.select({
			id: externalSubscriptions.id,
			customerTpid: externalSubscriptions.customerTpid,
		})
		.from(externalSubscriptions)
		.where(
			and(
				eq(externalSubscriptions.orgId, orgId),
				isNotNull(externalSubscriptions.customerTpid),
				isNull(externalSubscriptions.accountName),
			),
		);

	for (const row of missingName) {
		if (!row.customerTpid) continue;

		const match = await db
			.select({
				customerName: masterCustomers.customerName,
				countryName: masterCustomers.countryName,
			})
			.from(masterCustomers)
			.where(eq(masterCustomers.customerTpid, row.customerTpid))
			.limit(1);

		if (match[0]?.customerName) {
			const updates: Record<string, any> = { updatedAt: new Date() };
			updates.accountName = match[0].customerName;
			if (match[0].countryName)
				updates.countryName = match[0].countryName;

			await db
				.update(externalSubscriptions)
				.set(updates)
				.where(eq(externalSubscriptions.id, row.id));
			enrichedCount++;
		}
	}

	// ── 3. Partner: partnerName present, partnerGlobalId missing ─
	const missingGlobalId = await db
		.select({
			id: externalSubscriptions.id,
			partnerName: externalSubscriptions.partnerName,
		})
		.from(externalSubscriptions)
		.where(
			and(
				eq(externalSubscriptions.orgId, orgId),
				isNotNull(externalSubscriptions.partnerName),
				isNull(externalSubscriptions.partnerGlobalId),
			),
		);

	for (const row of missingGlobalId) {
		if (!row.partnerName) continue;

		const match = await db
			.select({
				globalId: masterPartners.globalId,
				oneId: masterPartners.mpnId,
			})
			.from(masterPartners)
			.where(
				eq(
					sql`lower(trim(${masterPartners.name}))`,
					row.partnerName.trim().toLowerCase(),
				),
			)
			.limit(1);

		if (match[0]) {
			const updates: Record<string, any> = { updatedAt: new Date() };
			if (match[0].globalId) updates.partnerGlobalId = match[0].globalId;
			if (match[0].mpnId) updates.mpnId = match[0].mpnId;

			if (Object.keys(updates).length > 1) {
				await db
					.update(externalSubscriptions)
					.set(updates)
					.where(eq(externalSubscriptions.id, row.id));
				enrichedCount++;
			}
		}
	}

	// ── 4. Partner: partnerGlobalId present, partnerName missing ─
	const missingPartnerName = await db
		.select({
			id: externalSubscriptions.id,
			partnerGlobalId: externalSubscriptions.partnerGlobalId,
		})
		.from(externalSubscriptions)
		.where(
			and(
				eq(externalSubscriptions.orgId, orgId),
				isNotNull(externalSubscriptions.partnerGlobalId),
				isNull(externalSubscriptions.partnerName),
			),
		);

	for (const row of missingPartnerName) {
		if (!row.partnerGlobalId) continue;

		const match = await db
			.select({
				name: masterPartners.name,
				oneId: masterPartners.mpnId,
			})
			.from(masterPartners)
			.where(eq(masterPartners.globalId, row.partnerGlobalId))
			.limit(1);

		if (match[0]?.name) {
			const updates: Record<string, any> = { updatedAt: new Date() };
			updates.partnerName = match[0].name;
			if (match[0].mpnId) updates.mpnId = match[0].mpnId;

			await db
				.update(externalSubscriptions)
				.set(updates)
				.where(eq(externalSubscriptions.id, row.id));
			enrichedCount++;
		}
	}

	// ── 5. Distributor: name present, distributorId missing ──────
	const missingDistId = await db
		.select({
			id: externalSubscriptions.id,
			distributorName: externalSubscriptions.distributorName,
		})
		.from(externalSubscriptions)
		.where(
			and(
				eq(externalSubscriptions.orgId, orgId),
				isNotNull(externalSubscriptions.distributorName),
				isNull(externalSubscriptions.distributorId),
			),
		);

	for (const row of missingDistId) {
		if (!row.distributorName) continue;

		const match = await db
			.select({ distributorId: masterDistributors.distributorId })
			.from(masterDistributors)
			.where(
				eq(
					sql`lower(trim(${masterDistributors.name}))`,
					row.distributorName.trim().toLowerCase(),
				),
			)
			.limit(1);

		if (match[0]?.distributorId) {
			await db
				.update(externalSubscriptions)
				.set({
					distributorId: match[0].distributorId,
					updatedAt: new Date(),
				})
				.where(eq(externalSubscriptions.id, row.id));
			enrichedCount++;
		}
	}

	// ── 6. Distributor: distributorId present, name missing ──────
	const missingDistName = await db
		.select({
			id: externalSubscriptions.id,
			distributorId: externalSubscriptions.distributorId,
		})
		.from(externalSubscriptions)
		.where(
			and(
				eq(externalSubscriptions.orgId, orgId),
				isNotNull(externalSubscriptions.distributorId),
				isNull(externalSubscriptions.distributorName),
			),
		);

	for (const row of missingDistName) {
		if (!row.distributorId) continue;

		const match = await db
			.select({ name: masterDistributors.name })
			.from(masterDistributors)
			.where(eq(masterDistributors.distributorId, row.distributorId))
			.limit(1);

		if (match[0]?.name) {
			await db
				.update(externalSubscriptions)
				.set({
					distributorName: match[0].name,
					updatedAt: new Date(),
				})
				.where(eq(externalSubscriptions.id, row.id));
			enrichedCount++;
		}
	}

	return { enrichedCount };
}
