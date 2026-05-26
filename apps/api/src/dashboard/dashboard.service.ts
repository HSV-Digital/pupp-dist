import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { and, asc, sql, type SQL } from 'drizzle-orm';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { subscriptions } from '../database/schema';
import type { DashboardFilterDimension } from './dto/dashboard-options-query.dto';
import type { DashboardQueryDto } from './dto/dashboard-query.dto';
import type {
	DashboardCustomerRow,
	DashboardFilterState,
	DashboardOpportunityRow,
	DashboardResellerRow,
	DashboardResponse,
	DashboardSortDirection,
	DashboardSummaryResponse,
	DashboardViewMode,
} from './dashboard.types';
import {
	buildCustomerOrderBy,
	buildOpportunityOrderBy,
	buildResellerOrderBy,
	buildWhereClause,
	DROPDOWN_FILTER_COLUMN_MAP,
	DROPDOWN_FILTER_KEYS,
	nearestRenewalDateExpr,
	normalizedSkuCategoryExpr,
	SMART_FILTER_SQL_CONFIG,
} from './dashboard-query-builder';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 15;
const EXPORT_ROW_CAP = 100_000;

const ALLOWED_SKU_CATEGORIES = new Set([
	'Basic',
	'Standard',
	'Premium',
	'E3',
	'E5',
	'Copilot',
	'Other',
]);

const OPPORTUNITY_SORT_KEYS = new Set([
	'customerName',
	'resellerName',
	'annualRevenueRunRate',
	'currentProduct',
	'seatCount',
	'renewalDate',
]);

const CUSTOMER_SORT_KEYS = new Set([
	'customerName',
	'resellerName',
	'totalARR',
	'totalSeats',
	'subscriptions',
	'renewalDate',
]);

const RESELLER_SORT_KEYS = new Set([
	'resellerName',
	'totalARR',
	'totalSeats',
	'customerCount',
	'subscriptions',
	'renewalDate',
]);

type DashboardIncludePart = 'rows' | 'summary' | 'options';

interface DashboardIncludePlan {
	rows: boolean;
	summary: boolean;
	options: boolean;
	requestedParts: DashboardIncludePart[];
}

const DASHBOARD_INCLUDE_PARTS = ['rows', 'summary', 'options'] as const;
const DASHBOARD_INCLUDE_PARTS_SET = new Set<DashboardIncludePart>(
	DASHBOARD_INCLUDE_PARTS,
);
const DEFAULT_OPTIONS_LIMIT = 200;
const MAX_OPTIONS_LIMIT = 500;
const DEFAULT_OPTIONS_SEARCH_LIMIT = 50;
const MAX_OPTIONS_SEARCH_LIMIT = 100;

export function resolveDashboardIncludePlan(
	query: Pick<DashboardQueryDto, 'include' | 'includeParts'>,
): DashboardIncludePlan {
	const includePartsRaw = query.includeParts?.trim();

	if (includePartsRaw) {
		const requestedParts = includePartsRaw
			.split(',')
			.map((part) => part.trim().toLowerCase())
			.filter((part): part is DashboardIncludePart =>
				DASHBOARD_INCLUDE_PARTS_SET.has(part as DashboardIncludePart),
			)
			.filter((part, index, parts) => parts.indexOf(part) === index);

		if (requestedParts.length > 0) {
			return {
				rows: true,
				summary: requestedParts.includes('summary'),
				options: requestedParts.includes('options'),
				requestedParts,
			};
		}
	}

	if (query.include === 'rows') {
		return {
			rows: true,
			summary: false,
			options: false,
			requestedParts: ['rows'],
		};
	}

	if (query.include === 'summary') {
		return {
			rows: true,
			summary: true,
			options: false,
			requestedParts: ['rows', 'summary'],
		};
	}

	if (query.include === 'options') {
		return {
			rows: true,
			summary: false,
			options: true,
			requestedParts: ['rows', 'options'],
		};
	}

	return {
		rows: true,
		summary: true,
		options: true,
		requestedParts: ['rows', 'summary', 'options'],
	};
}

export function resolveDashboardOptionsLimit(value?: number): number {
	if (!value || !Number.isFinite(value)) {
		return DEFAULT_OPTIONS_LIMIT;
	}

	return Math.min(MAX_OPTIONS_LIMIT, Math.max(1, Math.floor(value)));
}

export function resolveDashboardOptionsSearchLimit(value?: number): number {
	if (!value || !Number.isFinite(value)) {
		return DEFAULT_OPTIONS_SEARCH_LIMIT;
	}

	return Math.min(MAX_OPTIONS_SEARCH_LIMIT, Math.max(1, Math.floor(value)));
}

function sortAndLimitValues(values: string[], limit: number): string[] {
	const sanitized = values.filter((value) => value.trim().length > 0);
	sanitized.sort((left, right) => left.localeCompare(right));

	return sanitized.length <= limit ? sanitized : sanitized.slice(0, limit);
}

function normalizeSkuCategory(value: string): string {
	return ALLOWED_SKU_CATEGORIES.has(value) ? value : 'Other';
}

function normalizeFilterState(query: DashboardQueryDto): DashboardFilterState {
	return {
		pssAIWorkforce: query.pssAIWorkforce ?? [],
		pssAISecurity: query.pssAISecurity ?? [],
		psa: query.psa ?? [],
		distributor: query.distributor ?? [],
		reseller: query.reseller ?? [],
		customer: query.customer ?? [],
		pdm: query.pdm ?? [],
		pmm: query.pmm ?? [],
		region: query.region ?? [],
		type: query.type ?? [],
		skuCategory: query.skuCategory ?? [],
		expSeats: query.expSeats ?? [],
		renewalDate: query.renewalDate ?? [],
		pastRenewalDate: query.pastRenewalDate ?? [],
	};
}

function escapeLikePattern(value: string): string {
	return value
		.replaceAll('\\', '\\\\')
		.replaceAll('%', '\\%')
		.replaceAll('_', '\\_');
}

function sanitizePage(value?: number): number {
	if (!value || !Number.isFinite(value) || value < 1) {
		return DEFAULT_PAGE;
	}
	return Math.floor(value);
}

function sanitizePageSize(value?: number): number {
	if (!value || !Number.isFinite(value) || value < 1) {
		return DEFAULT_PAGE_SIZE;
	}
	return Math.min(10000, Math.floor(value));
}

function resolveViewMode(value?: DashboardViewMode): DashboardViewMode {
	return value ?? 'customer';
}

function resolveSortDirection(
	value?: DashboardSortDirection,
): DashboardSortDirection {
	return value ?? 'descending';
}

function resolveSortBy(viewMode: DashboardViewMode, sortBy?: string): string {
	if (viewMode === 'opportunity') {
		return OPPORTUNITY_SORT_KEYS.has(sortBy ?? '')
			? (sortBy as string)
			: 'annualRevenueRunRate';
	}
	if (viewMode === 'reseller') {
		return RESELLER_SORT_KEYS.has(sortBy ?? '')
			? (sortBy as string)
			: 'totalSeats';
	}
	return CUSTOMER_SORT_KEYS.has(sortBy ?? '') ? (sortBy as string) : 'totalSeats';
}

@Injectable()
export class DashboardService implements OnModuleDestroy {
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;
	private readonly pgSql = this.databaseClient.sql;

	async getDashboard(query: DashboardQueryDto): Promise<DashboardResponse> {
		const viewMode = resolveViewMode(query.viewMode);
		const page = sanitizePage(query.page);
		const pageSize = sanitizePageSize(query.pageSize);
		const filters = normalizeFilterState(query);
		const search = query.search ?? '';
		const sortDir = resolveSortDirection(query.sortDir);
		const sortBy = resolveSortBy(viewMode, query.sortBy);
		const includePlan = resolveDashboardIncludePlan(query);
		const optionsLimit = resolveDashboardOptionsLimit(query.optionsLimit);

		const [summary, { rows, total }, availableOptions] = await Promise.all([
			includePlan.summary ? this.querySummary() : null,
			this.queryPaginatedRows({
				viewMode,
				filters,
				search,
				sortBy,
				sortDir,
				limit: pageSize,
				offset: (page - 1) * pageSize,
				customerId: query.customerId,
			}),
			includePlan.options
				? this.queryAvailableOptions(filters, query.customerId, optionsLimit)
				: null,
		]);

		const response: DashboardResponse = {
			viewMode,
			page,
			pageSize,
			total,
			sortBy,
			sortDir,
			rows,
		};

		if (summary) {
			response.summary = summary;
		}
		if (availableOptions) {
			response.availableOptions = availableOptions;
		}

		return response;
	}

	async getDashboardOptions(
		query: DashboardQueryDto & {
			dimension: DashboardFilterDimension;
			q: string;
			limit?: number;
		},
	): Promise<string[]> {
		const trimmedQuery = query.q.trim();
		if (trimmedQuery.length === 0) {
			return [];
		}

		const limit = resolveDashboardOptionsSearchLimit(query.limit);
		const column = DROPDOWN_FILTER_COLUMN_MAP[query.dimension];
		const filters = normalizeFilterState(query);

		const baseWhere = buildWhereClause({
			filters,
			customerId: query.customerId,
			excludeKey: query.dimension,
		});

		const pattern = `${escapeLikePattern(trimmedQuery)}%`;
		const conditions: SQL[] = [
			sql`trim(${column}) <> ''`,
			sql`trim(${column}) ILIKE ${pattern} ESCAPE '\\'`,
		];

		if (baseWhere) {
			conditions.push(baseWhere);
		}

		const whereClause =
			conditions.length === 1 ? conditions[0] : and(...conditions)!;

		const rows = await this.db
			.selectDistinct({
				value: sql<string>`trim(${column})`,
			})
			.from(subscriptions)
			.where(whereClause)
			.orderBy(asc(sql`trim(${column})`))
			.limit(limit);

		return sortAndLimitValues(
			rows.map((row) => row.value).filter((value) => value != null),
			limit,
		);
	}

	async getExportRows(params: {
		viewMode: DashboardViewMode;
		filters: DashboardFilterState;
		search: string;
		sortBy: string;
		sortDir: DashboardSortDirection;
		customerId?: string;
	}): Promise<
		DashboardOpportunityRow[] | DashboardCustomerRow[] | DashboardResellerRow[]
	> {
		const { rows } = await this.queryPaginatedRows({
			viewMode: params.viewMode,
			filters: params.filters,
			search: params.search,
			sortBy: params.sortBy,
			sortDir: params.sortDir,
			limit: EXPORT_ROW_CAP,
			offset: 0,
			customerId: params.customerId,
		});
		return rows;
	}

	async getExportRowCount(params: {
		viewMode: DashboardViewMode;
		filters: DashboardFilterState;
		search: string;
		customerId?: string;
	}): Promise<number> {
		const where = buildWhereClause({
			filters: params.filters,
			search: params.search,
			customerId: params.customerId,
		});

		if (params.viewMode === 'opportunity') {
			const countQ = this.db
				.select({ value: sql<number>`count(*)` })
				.from(subscriptions);
			const [result] = where ? await countQ.where(where) : await countQ;
			return Number(result?.value ?? 0);
		}

		if (params.viewMode === 'reseller') {
			const countQ = this.db
				.select({
					value: sql<number>`count(distinct ${subscriptions.resellerName})`,
				})
				.from(subscriptions);
			const [result] = where ? await countQ.where(where) : await countQ;
			return Number(result?.value ?? 0);
		}

		const countQ = this.db
			.select({
				value: sql<number>`count(distinct ${subscriptions.customerId})`,
			})
			.from(subscriptions);
		const [result] = where ? await countQ.where(where) : await countQ;
		return Number(result?.value ?? 0);
	}

	async onModuleDestroy(): Promise<void> {
		await this.pgSql.end();
	}

	// ----- Summary aggregation -----

	private async querySummary(
	): Promise<DashboardSummaryResponse> {
		const q = this.db
			.select({
				totalRenewals: sql<number>`count(*)`,
				totalSeats: sql<number>`coalesce(sum(${subscriptions.seatCount}), 0)`,
				expiringARR: sql<number>`coalesce(sum(${subscriptions.annualRevenueRunRate}), 0)`,
				copilotOpportunities: sql<number>`count(*) filter (where not ${subscriptions.hasCopilot})`,
				totalCustomers: sql<number>`count(distinct ${subscriptions.customerId})`,
				totalResellers: sql<number>`count(distinct ${subscriptions.resellerName})`,
			})
			.from(subscriptions);

		const [row] = await q;

		return {
			totalRenewals: Number(row?.totalRenewals ?? 0),
			totalSeats: Number(row?.totalSeats ?? 0),
			expiringARR: Number(row?.expiringARR ?? 0),
			copilotOpportunities: Number(row?.copilotOpportunities ?? 0),
			totalCustomers: Number(row?.totalCustomers ?? 0),
			totalResellers: Number(row?.totalResellers ?? 0),
		};
	}

	// ----- Paginated rows (dispatched by view mode) -----

	private async queryPaginatedRows(params: {
		viewMode: DashboardViewMode;
		filters: DashboardFilterState;
		search: string;
		sortBy: string;
		sortDir: DashboardSortDirection;
		limit: number;
		offset: number;
		customerId?: string;
	}): Promise<{
		rows:
			| DashboardOpportunityRow[]
			| DashboardCustomerRow[]
			| DashboardResellerRow[];
		total: number;
	}> {
		const where = buildWhereClause({
			filters: params.filters,
			search: params.search,
			customerId: params.customerId,
		});

		if (params.viewMode === 'opportunity') {
			return this.queryOpportunityRows(where, params);
		}
		if (params.viewMode === 'reseller') {
			return this.queryResellerRows(where, params);
		}
		return this.queryCustomerRows(where, params);
	}

	private async queryOpportunityRows(
		where: ReturnType<typeof buildWhereClause>,
		params: {
			sortBy: string;
			sortDir: DashboardSortDirection;
			limit: number;
			offset: number;
		},
	): Promise<{ rows: DashboardOpportunityRow[]; total: number }> {
		const orderBy = buildOpportunityOrderBy(params.sortBy, params.sortDir);

		const dataQ = this.db
			.select({
				customerId: subscriptions.customerId,
				subscriptionId: subscriptions.subscriptionId,
				customerName: subscriptions.customerName,
				resellerName: subscriptions.resellerName,
				distributorName: subscriptions.distributorName,
				pssAIWorkforceName: subscriptions.pssAIWorkforceName,
				pssAISecurityName: subscriptions.pssAISecurityName,
				psaName: subscriptions.psaName,
				pdmName: subscriptions.pdmName,
				pmmName: subscriptions.pmmName,
				currentProduct: subscriptions.currentProduct,
				type: subscriptions.type,
				skuCategory: subscriptions.skuCategory,
				seatCount: subscriptions.seatCount,
				annualRevenueRunRate: subscriptions.annualRevenueRunRate,
				renewalDate: subscriptions.renewalDate,
				termMonths: subscriptions.termMonths,
				autoRenew: subscriptions.autoRenew,
				multiYear: subscriptions.multiYear,
				hasCopilot: subscriptions.hasCopilot,
				hasPurview: subscriptions.hasPurview,
				hasSureStep: subscriptions.hasSureStep,
				currentMargin: subscriptions.currentMargin,
				customerSegment: subscriptions.customerSegment,
				region: subscriptions.region,
				notes: subscriptions.notes,
				totalRows: sql<number>`count(*) over()`,
			})
			.from(subscriptions);

		const dbRows = await (where ? dataQ.where(where) : dataQ)
			.orderBy(orderBy)
			.limit(params.limit)
			.offset(params.offset);

		let total = Number(dbRows[0]?.totalRows ?? 0);
		if (dbRows.length === 0 && params.offset > 0) {
			const countQ = this.db
				.select({ value: sql<number>`count(*)` })
				.from(subscriptions);
			const [countResult] = where ? await countQ.where(where) : await countQ;
			total = Number(countResult?.value ?? 0);
		}

		const rows: DashboardOpportunityRow[] = dbRows.map((row) => ({
			customerId: row.customerId,
			subscriptionId: row.subscriptionId,
			customerName: row.customerName,
			resellerName: row.resellerName,
			distributorName: row.distributorName,
			pssAIWorkforceName: row.pssAIWorkforceName,
			pssAISecurityName: row.pssAISecurityName,
			psaName: row.psaName,
			pdmName: row.pdmName,
			pmmName: row.pmmName,
			currentProduct: row.currentProduct,
			type: row.type,
			skuCategory: normalizeSkuCategory(row.skuCategory),
			seatCount: row.seatCount,
			annualRevenueRunRate: row.annualRevenueRunRate,
			renewalDate: row.renewalDate,
			termMonths: row.termMonths,
			autoRenew: row.autoRenew,
			multiYear: row.multiYear,
			hasCopilot: row.hasCopilot,
			hasPurview: row.hasPurview,
			hasSureStep: row.hasSureStep,
			currentMargin: row.currentMargin,
			customerSegment: row.customerSegment,
			region: row.region,
			notes: row.notes,
		}));

		return { rows, total };
	}

	private async queryCustomerRows(
		where: ReturnType<typeof buildWhereClause>,
		params: {
			sortBy: string;
			sortDir: DashboardSortDirection;
			limit: number;
			offset: number;
		},
	): Promise<{ rows: DashboardCustomerRow[]; total: number }> {
		const orderBy = buildCustomerOrderBy(params.sortBy, params.sortDir);

		const dataQ = this.db
			.select({
				customerId: subscriptions.customerId,
				customerName: sql<string>`min(${subscriptions.customerName})`,
				resellerName: sql<string>`min(${subscriptions.resellerName})`,
				distributorName: sql<string>`min(${subscriptions.distributorName})`,
				totalARR: sql<number>`sum(${subscriptions.annualRevenueRunRate})`,
				totalSeats: sql<number>`sum(${subscriptions.seatCount})`,
				subscriptionCount: sql<number>`count(*)`,
				subscriptionSkuCategories: sql<
					string[]
				>`array_agg(distinct ${normalizedSkuCategoryExpr()})`,
				renewalDate: nearestRenewalDateExpr(),
				totalRows: sql<number>`count(*) over()`,
			})
			.from(subscriptions);

		const dbRows = await (where ? dataQ.where(where) : dataQ)
			.groupBy(subscriptions.customerId)
			.orderBy(orderBy)
			.limit(params.limit)
			.offset(params.offset);

		let total = Number(dbRows[0]?.totalRows ?? 0);
		if (dbRows.length === 0 && params.offset > 0) {
			const countQ = this.db
				.select({
					value: sql<number>`count(distinct ${subscriptions.customerId})`,
				})
				.from(subscriptions);
			const [countResult] = where ? await countQ.where(where) : await countQ;
			total = Number(countResult?.value ?? 0);
		}

		const rows: DashboardCustomerRow[] = dbRows.map((row) => ({
			customerId: row.customerId,
			customerName: row.customerName ?? '',
			resellerName: row.resellerName ?? '',
			distributorName: row.distributorName ?? '',
			totalARR: Number(row.totalARR ?? 0),
			totalSeats: Number(row.totalSeats ?? 0),
			subscriptionCount: Number(row.subscriptionCount ?? 0),
			subscriptionSkuCategories: row.subscriptionSkuCategories ?? [],
			renewalDate: row.renewalDate ?? '',
		}));

		return { rows, total };
	}

	private async queryResellerRows(
		where: ReturnType<typeof buildWhereClause>,
		params: {
			sortBy: string;
			sortDir: DashboardSortDirection;
			limit: number;
			offset: number;
		},
	): Promise<{ rows: DashboardResellerRow[]; total: number }> {
		const orderBy = buildResellerOrderBy(params.sortBy, params.sortDir);

		const dataQ = this.db
			.select({
				resellerName: subscriptions.resellerName,
				totalARR: sql<number>`sum(${subscriptions.annualRevenueRunRate})`,
				totalSeats: sql<number>`sum(${subscriptions.seatCount})`,
				customerCount: sql<number>`count(distinct ${subscriptions.customerId})`,
				subscriptionCount: sql<number>`count(*)`,
				renewalDate: nearestRenewalDateExpr(),
				totalRows: sql<number>`count(*) over()`,
			})
			.from(subscriptions);

		const dbRows = await (where ? dataQ.where(where) : dataQ)
			.groupBy(subscriptions.resellerName)
			.orderBy(orderBy)
			.limit(params.limit)
			.offset(params.offset);

		let total = Number(dbRows[0]?.totalRows ?? 0);
		if (dbRows.length === 0 && params.offset > 0) {
			const countQ = this.db
				.select({
					value: sql<number>`count(distinct ${subscriptions.resellerName})`,
				})
				.from(subscriptions);
			const [countResult] = where ? await countQ.where(where) : await countQ;
			total = Number(countResult?.value ?? 0);
		}

		const rows: DashboardResellerRow[] = dbRows.map((row) => ({
			resellerName: row.resellerName,
			totalARR: Number(row.totalARR ?? 0),
			totalSeats: Number(row.totalSeats ?? 0),
			customerCount: Number(row.customerCount ?? 0),
			subscriptionCount: Number(row.subscriptionCount ?? 0),
			renewalDate: row.renewalDate ?? '',
		}));

		return { rows, total };
	}

	// ----- Faceted search: available options per dimension -----
	//
	// P1-2: Inactive dimensions (no active filter values) all share the same
	// base WHERE clause, so they're combined into a single query. Only
	// active dimensions (where excludeKey changes the WHERE) run individually.
	// Initial load (0 active filters): 9 queries → 1.

	private async queryAvailableOptions(
		filters: DashboardFilterState,
		customerId?: string,
		optionsLimit = DEFAULT_OPTIONS_LIMIT,
	): Promise<Record<keyof DashboardFilterState, string[]>> {
		const result = {} as Record<keyof DashboardFilterState, string[]>;

		const activeDropdownKeys = DROPDOWN_FILTER_KEYS.filter(
			(key) => filters[key].length > 0,
		);
		const inactiveDropdownKeys = DROPDOWN_FILTER_KEYS.filter(
			(key) => filters[key].length === 0,
		);
		const activeSmartDims = SMART_FILTER_SQL_CONFIG.filter(
			(dim) => filters[dim.key].length > 0,
		);
		const inactiveSmartDims = SMART_FILTER_SQL_CONFIG.filter(
			(dim) => filters[dim.key].length === 0,
		);

		const promises: Promise<void>[] = [];

		// Combined query for all inactive dimensions (same base WHERE)
		if (inactiveDropdownKeys.length > 0 || inactiveSmartDims.length > 0) {
			promises.push(
				(async () => {
					const baseWhere = buildWhereClause({ filters, customerId });
					const selectObj: Record<string, ReturnType<typeof sql>> = {};

					for (const key of inactiveDropdownKeys) {
						const column = DROPDOWN_FILTER_COLUMN_MAP[key];
						selectObj[key] =
							sql`array_agg(distinct trim(${column})) filter (where trim(${column}) <> '')`;
					}

					for (const dim of inactiveSmartDims) {
						dim.buckets.forEach((bucket, i) => {
							selectObj[`${dim.key}_b${i}`] =
								sql<boolean>`bool_or(${bucket.predicate})`;
						});
					}

					const q = this.db.select(selectObj).from(subscriptions);
					const [row] = baseWhere ? await q.where(baseWhere) : await q;

					for (const key of inactiveDropdownKeys) {
						const rawValues: string[] =
							(row as Record<string, string[] | null>)?.[key] ?? [];
						const values = sortAndLimitValues(
							rawValues.filter((value) => value != null),
							optionsLimit,
						);
						result[key] = values;
					}

					for (const dim of inactiveSmartDims) {
						const labels = dim.buckets
							.filter(
								(_, i) =>
									(row as unknown as Record<string, boolean>)?.[
										`${dim.key}_b${i}`
									] === true,
							)
							.map((b) => b.label);
						result[dim.key] =
							labels.length <= optionsLimit
								? labels
								: labels.slice(0, optionsLimit);
					}
				})(),
			);
		}

		// Individual queries for active dropdown dimensions (each excludes itself)
		for (const key of activeDropdownKeys) {
			promises.push(
				(async () => {
					const where = buildWhereClause({
						filters,
						customerId,
						excludeKey: key,
					});
					const column = DROPDOWN_FILTER_COLUMN_MAP[key];

					const q = this.db
						.selectDistinct({
							value: sql<string>`trim(${column})`,
						})
						.from(subscriptions);

					const rows = where ? await q.where(where) : await q;

					const values = sortAndLimitValues(
						rows.map((r) => r.value).filter((value) => value !== null),
						optionsLimit,
					);
					result[key] = values;
				})(),
			);
		}

		// Individual queries for active smart filter dimensions
		for (const dim of activeSmartDims) {
			promises.push(
				(async () => {
					const where = buildWhereClause({
						filters,
						customerId,
						excludeKey: dim.key,
					});

					const selectObj: Record<string, ReturnType<typeof sql>> = {};
					dim.buckets.forEach((bucket, i) => {
						selectObj[`b${i}`] = sql<boolean>`bool_or(${bucket.predicate})`;
					});

					const q = this.db.select(selectObj).from(subscriptions);
					const [row] = where ? await q.where(where) : await q;

					const labels = dim.buckets
						.filter(
							(_, i) =>
								(row as unknown as Record<string, boolean>)?.[`b${i}`] === true,
						)
						.map((b) => b.label);
					result[dim.key] =
						labels.length <= optionsLimit
							? labels
							: labels.slice(0, optionsLimit);
				})(),
			);
		}

		await Promise.all(promises);
		return result;
	}
}
