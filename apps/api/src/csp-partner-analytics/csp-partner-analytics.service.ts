import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { and, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import {
	cspPartnerAnalyticsEvents,
	externalSubscriptions,
	resellerOrganizations,
	CSP_PARTNER_COUNTRY_VALUES,
	CSP_PARTNER_ENDING_SKU_IDS,
	CSP_PARTNER_STARTING_SKU_IDS,
} from '../database/schema';
import type {
	CspPartnerCountry,
	CspPartnerEndingSkuId,
	CspPartnerStartingSkuId,
} from '../database/schema';
import {
	CSP_PARTNER_ENDING_SKU_LABELS,
	DEMO_TENANT_ORG_ID,
	resolveRangeWindow,
	type CspPartnerAnalyticsByCountrySeries,
	type CspPartnerAnalyticsByCountrySkuSeries,
	type CspPartnerAnalyticsFilterOptions,
	type CspPartnerAnalyticsFilters,
	type CspPartnerAnalyticsSkuPieGrid,
	type CspPartnerAnalyticsSkuTabTotals,
	type CspPartnerAnalyticsTileCounts,
	type CspPartnerSkuDimension,
} from './csp-partner-analytics.types';

const DISTINCT_GENERATION_REQUEST_ID = sql<number>`count(distinct (${cspPartnerAnalyticsEvents.metadata}->>'generationRequestId'))::int`;

@Injectable()
export class CspPartnerAnalyticsService implements OnModuleDestroy {
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;

	async onModuleDestroy() {
		await this.databaseClient.sql.end();
	}

	async getTileCounts(
		filters: CspPartnerAnalyticsFilters,
	): Promise<CspPartnerAnalyticsTileCounts> {
		const { from, to } = resolveRangeWindow(filters.range);

		const baseConditions = [
			ne(cspPartnerAnalyticsEvents.orgId, DEMO_TENANT_ORG_ID),
			gte(cspPartnerAnalyticsEvents.createdAt, from),
			lte(cspPartnerAnalyticsEvents.createdAt, to),
		];
		if (filters.partnerOrgId) {
			baseConditions.push(eq(cspPartnerAnalyticsEvents.orgId, filters.partnerOrgId));
		}

		const countryConditions =
			filters.countries && filters.countries.length > 0
				? [inArray(cspPartnerAnalyticsEvents.country, filters.countries)]
				: [];

		const loginConditions = [
			...baseConditions,
			eq(cspPartnerAnalyticsEvents.eventType, 'login'),
		];

		const viewConditions = [
			...baseConditions,
			eq(cspPartnerAnalyticsEvents.eventType, 'view_proposal'),
			...countryConditions,
		];

		const generatedConditions = [
			...baseConditions,
			eq(cspPartnerAnalyticsEvents.eventType, 'proposal_generated'),
			...countryConditions,
		];

		const uploadConditions = [
			...baseConditions,
			eq(cspPartnerAnalyticsEvents.eventType, 'subscription_upload'),
			...countryConditions,
		];

		const [loginsRow, viewsRow, generatedRow, uploadsRow] = await Promise.all([
			this.db
				.select({ count: sql<number>`count(*)::int` })
				.from(cspPartnerAnalyticsEvents)
				.where(and(...loginConditions)),
			this.db
				.select({ count: sql<number>`count(*)::int` })
				.from(cspPartnerAnalyticsEvents)
				.where(and(...viewConditions)),
			this.db
				.select({ count: DISTINCT_GENERATION_REQUEST_ID })
				.from(cspPartnerAnalyticsEvents)
				.where(and(...generatedConditions)),
			this.db
				.select({
					total: sql<number>`coalesce(sum(${cspPartnerAnalyticsEvents.uploadCount}), 0)::int`,
				})
				.from(cspPartnerAnalyticsEvents)
				.where(and(...uploadConditions)),
		]);

		return {
			logins: loginsRow[0]?.count ?? 0,
			views: viewsRow[0]?.count ?? 0,
			generated: generatedRow[0]?.count ?? 0,
			uploads: uploadsRow[0]?.total ?? 0,
		};
	}

	async getFilterOptions(
		filters: CspPartnerAnalyticsFilters,
	): Promise<CspPartnerAnalyticsFilterOptions> {
		const { from, to } = resolveRangeWindow(filters.range);

		const partnerConditions = [
			ne(cspPartnerAnalyticsEvents.orgId, DEMO_TENANT_ORG_ID),
			gte(cspPartnerAnalyticsEvents.createdAt, from),
			lte(cspPartnerAnalyticsEvents.createdAt, to),
		];
		if (filters.countries && filters.countries.length > 0) {
			partnerConditions.push(
				inArray(cspPartnerAnalyticsEvents.country, filters.countries),
			);
		}

		const countryConditions = [
			ne(cspPartnerAnalyticsEvents.orgId, DEMO_TENANT_ORG_ID),
			gte(cspPartnerAnalyticsEvents.createdAt, from),
			lte(cspPartnerAnalyticsEvents.createdAt, to),
			sql`${cspPartnerAnalyticsEvents.country} IS NOT NULL`,
		];
		if (filters.partnerOrgId) {
			countryConditions.push(
				eq(cspPartnerAnalyticsEvents.orgId, filters.partnerOrgId),
			);
		}

		const [partnerRows, countryRows] = await Promise.all([
			this.db
				.selectDistinct({
					orgId: cspPartnerAnalyticsEvents.orgId,
					name: resellerOrganizations.name,
				})
				.from(cspPartnerAnalyticsEvents)
				.innerJoin(
					resellerOrganizations,
					eq(resellerOrganizations.id, cspPartnerAnalyticsEvents.orgId),
				)
				.where(and(...partnerConditions)),
			this.db
				.selectDistinct({ country: cspPartnerAnalyticsEvents.country })
				.from(cspPartnerAnalyticsEvents)
				.where(and(...countryConditions)),
		]);

		const partners = partnerRows
			.map((row) => ({ orgId: row.orgId, name: row.name }))
			.sort((a, b) => a.name.localeCompare(b.name));

		const countries = countryRows
			.map((row) => row.country)
			.filter((value): value is CspPartnerCountry => value !== null)
			.sort((a, b) => a.localeCompare(b));

		return { partners, countries };
	}

	async getByCountrySeries(
		filters: CspPartnerAnalyticsFilters,
	): Promise<CspPartnerAnalyticsByCountrySeries> {
		const { from, to } = resolveRangeWindow(filters.range);

		const conditions = [
			ne(cspPartnerAnalyticsEvents.orgId, DEMO_TENANT_ORG_ID),
			gte(cspPartnerAnalyticsEvents.createdAt, from),
			lte(cspPartnerAnalyticsEvents.createdAt, to),
			sql`${cspPartnerAnalyticsEvents.country} IS NOT NULL`,
			or(
				eq(cspPartnerAnalyticsEvents.eventType, 'view_proposal'),
				eq(cspPartnerAnalyticsEvents.eventType, 'proposal_generated'),
			),
		];
		if (filters.partnerOrgId) {
			conditions.push(eq(cspPartnerAnalyticsEvents.orgId, filters.partnerOrgId));
		}
		if (filters.countries && filters.countries.length > 0) {
			conditions.push(
				inArray(cspPartnerAnalyticsEvents.country, filters.countries),
			);
		}

		const rows = await this.db
			.select({
				country: cspPartnerAnalyticsEvents.country,
				views: sql<number>`count(*) filter (where ${cspPartnerAnalyticsEvents.eventType} = 'view_proposal')::int`,
				generated: sql<number>`count(distinct (${cspPartnerAnalyticsEvents.metadata}->>'generationRequestId')) filter (where ${cspPartnerAnalyticsEvents.eventType} = 'proposal_generated')::int`,
			})
			.from(cspPartnerAnalyticsEvents)
			.where(and(...conditions))
			.groupBy(cspPartnerAnalyticsEvents.country);

		return rows
			.map((row) => ({
				country: row.country as CspPartnerCountry,
				views: row.views ?? 0,
				generated: row.generated ?? 0,
			}))
			.sort((a, b) => a.country.localeCompare(b.country));
	}

	async getByCountrySkuSeries(
		filters: CspPartnerAnalyticsFilters,
		dimension: CspPartnerSkuDimension,
		skuId: string | 'all',
	): Promise<CspPartnerAnalyticsByCountrySkuSeries> {
		const { from, to } = resolveRangeWindow(filters.range);

		const skuColumn =
			dimension === 'start'
				? cspPartnerAnalyticsEvents.startingSkuId
				: cspPartnerAnalyticsEvents.endingSkuId;
		const validSkuIds: readonly string[] =
			dimension === 'start'
				? CSP_PARTNER_STARTING_SKU_IDS
				: CSP_PARTNER_ENDING_SKU_IDS;

		const conditions = [
			ne(cspPartnerAnalyticsEvents.orgId, DEMO_TENANT_ORG_ID),
			gte(cspPartnerAnalyticsEvents.createdAt, from),
			lte(cspPartnerAnalyticsEvents.createdAt, to),
			eq(cspPartnerAnalyticsEvents.eventType, 'proposal_generated'),
			sql`${cspPartnerAnalyticsEvents.country} IS NOT NULL`,
		];
		if (filters.partnerOrgId) {
			conditions.push(eq(cspPartnerAnalyticsEvents.orgId, filters.partnerOrgId));
		}
		if (filters.countries && filters.countries.length > 0) {
			conditions.push(
				inArray(cspPartnerAnalyticsEvents.country, filters.countries),
			);
		}
		if (skuId !== 'all') {
			if (!validSkuIds.includes(skuId)) {
				return [];
			}
			if (dimension === 'start') {
				conditions.push(eq(skuColumn, skuId as CspPartnerStartingSkuId));
			} else {
				conditions.push(eq(skuColumn, skuId as CspPartnerEndingSkuId));
			}
		}

		const rows = await this.db
			.select({
				country: cspPartnerAnalyticsEvents.country,
				count: DISTINCT_GENERATION_REQUEST_ID,
			})
			.from(cspPartnerAnalyticsEvents)
			.where(and(...conditions))
			.groupBy(cspPartnerAnalyticsEvents.country);

		return rows
			.map((row) => ({
				country: row.country as CspPartnerCountry,
				count: row.count ?? 0,
			}))
			.sort((a, b) => a.country.localeCompare(b.country));
	}

	async getSkuTabTotals(
		filters: CspPartnerAnalyticsFilters,
		dimension: CspPartnerSkuDimension,
	): Promise<CspPartnerAnalyticsSkuTabTotals> {
		const { from, to } = resolveRangeWindow(filters.range);

		const skuColumn =
			dimension === 'start'
				? cspPartnerAnalyticsEvents.startingSkuId
				: cspPartnerAnalyticsEvents.endingSkuId;
		const validSkuIds: readonly string[] =
			dimension === 'start'
				? CSP_PARTNER_STARTING_SKU_IDS
				: CSP_PARTNER_ENDING_SKU_IDS;

		const conditions = [
			ne(cspPartnerAnalyticsEvents.orgId, DEMO_TENANT_ORG_ID),
			gte(cspPartnerAnalyticsEvents.createdAt, from),
			lte(cspPartnerAnalyticsEvents.createdAt, to),
			eq(cspPartnerAnalyticsEvents.eventType, 'proposal_generated'),
		];
		if (filters.partnerOrgId) {
			conditions.push(eq(cspPartnerAnalyticsEvents.orgId, filters.partnerOrgId));
		}
		if (filters.countries && filters.countries.length > 0) {
			conditions.push(
				inArray(cspPartnerAnalyticsEvents.country, filters.countries),
			);
		}

		const [allRow, bySkuRows] = await Promise.all([
			this.db
				.select({ count: DISTINCT_GENERATION_REQUEST_ID })
				.from(cspPartnerAnalyticsEvents)
				.where(and(...conditions)),
			this.db
				.select({
					skuId: skuColumn,
					count: DISTINCT_GENERATION_REQUEST_ID,
				})
				.from(cspPartnerAnalyticsEvents)
				.where(and(...conditions, sql`${skuColumn} IS NOT NULL`))
				.groupBy(skuColumn),
		]);

		const bySkuId: Record<string, number> = Object.fromEntries(
			validSkuIds.map((id) => [id, 0]),
		);
		for (const row of bySkuRows) {
			if (row.skuId && validSkuIds.includes(row.skuId)) {
				bySkuId[row.skuId] = row.count ?? 0;
			}
		}

		return {
			all: allRow[0]?.count ?? 0,
			bySkuId,
		};
	}

	async getSkuPieGrid(
		filters: CspPartnerAnalyticsFilters,
	): Promise<CspPartnerAnalyticsSkuPieGrid> {
		const { from, to } = resolveRangeWindow(filters.range);

		const conditions = [
			ne(cspPartnerAnalyticsEvents.orgId, DEMO_TENANT_ORG_ID),
			gte(cspPartnerAnalyticsEvents.createdAt, from),
			lte(cspPartnerAnalyticsEvents.createdAt, to),
			eq(cspPartnerAnalyticsEvents.eventType, 'proposal_generated'),
			sql`${cspPartnerAnalyticsEvents.startingSkuId} IS NOT NULL`,
			sql`${cspPartnerAnalyticsEvents.endingSkuId} IS NOT NULL`,
		];
		if (filters.partnerOrgId) {
			conditions.push(eq(cspPartnerAnalyticsEvents.orgId, filters.partnerOrgId));
		}
		if (filters.countries && filters.countries.length > 0) {
			conditions.push(
				inArray(cspPartnerAnalyticsEvents.country, filters.countries),
			);
		}

		const [breakdownRows, totalRows] = await Promise.all([
			this.db
				.select({
					endingSkuId: cspPartnerAnalyticsEvents.endingSkuId,
					startingSkuId: cspPartnerAnalyticsEvents.startingSkuId,
					count: DISTINCT_GENERATION_REQUEST_ID,
				})
				.from(cspPartnerAnalyticsEvents)
				.where(and(...conditions))
				.groupBy(
					cspPartnerAnalyticsEvents.endingSkuId,
					cspPartnerAnalyticsEvents.startingSkuId,
				),
			this.db
				.select({
					endingSkuId: cspPartnerAnalyticsEvents.endingSkuId,
					count: DISTINCT_GENERATION_REQUEST_ID,
				})
				.from(cspPartnerAnalyticsEvents)
				.where(and(...conditions))
				.groupBy(cspPartnerAnalyticsEvents.endingSkuId),
		]);

		const totalByEndSku = new Map<string, number>();
		for (const row of totalRows) {
			if (row.endingSkuId) {
				totalByEndSku.set(row.endingSkuId, row.count ?? 0);
			}
		}

		const startingSkuCountsByEndSku = new Map<string, Record<string, number>>();
		for (const endId of CSP_PARTNER_ENDING_SKU_IDS) {
			startingSkuCountsByEndSku.set(
				endId,
				Object.fromEntries(CSP_PARTNER_STARTING_SKU_IDS.map((id) => [id, 0])),
			);
		}
		for (const row of breakdownRows) {
			if (!row.endingSkuId || !row.startingSkuId) continue;
			const bucket = startingSkuCountsByEndSku.get(row.endingSkuId);
			if (!bucket) continue;
			bucket[row.startingSkuId] = row.count ?? 0;
		}

		return CSP_PARTNER_ENDING_SKU_IDS.map((endingSkuId) => ({
			endingSkuId,
			label: CSP_PARTNER_ENDING_SKU_LABELS[endingSkuId] ?? endingSkuId,
			total: totalByEndSku.get(endingSkuId) ?? 0,
			startingSkuCounts:
				startingSkuCountsByEndSku.get(endingSkuId) ??
				Object.fromEntries(CSP_PARTNER_STARTING_SKU_IDS.map((id) => [id, 0])),
		}));
	}

	async resolveCustomerCountry(
		orgId: string,
		customerIdentifier: string,
	): Promise<CspPartnerCountry | null> {
		const rows = await this.db
			.select({ countryName: externalSubscriptions.countryName })
			.from(externalSubscriptions)
			.where(
				and(
					eq(externalSubscriptions.orgId, orgId),
					or(
						eq(externalSubscriptions.customerTpid, customerIdentifier),
						eq(externalSubscriptions.accountName, customerIdentifier),
					),
				),
			)
			.limit(1);

		const value = rows[0]?.countryName ?? null;
		if (value === null) return null;
		return CSP_PARTNER_COUNTRY_VALUES.includes(value as CspPartnerCountry)
			? (value as CspPartnerCountry)
			: null;
	}
}
