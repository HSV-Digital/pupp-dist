import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { SeatRange } from '@repo/types';
import { subscriptions } from '../database/schema';
import type {
	DashboardFilterState,
	DashboardSortDirection,
} from './dashboard.types';

// ----- Dropdown filter → column mapping -----

type DropdownFilterKey =
	| 'pssAIWorkforce'
	| 'pssAISecurity'
	| 'psa'
	| 'distributor'
	| 'reseller'
	| 'customer'
	| 'pdm'
	| 'pmm'
	| 'region'
	| 'type';

export const DROPDOWN_FILTER_COLUMN_MAP = {
	pssAIWorkforce: subscriptions.pssAIWorkforceName,
	pssAISecurity: subscriptions.pssAISecurityName,
	psa: subscriptions.psaName,
	distributor: subscriptions.distributorName,
	reseller: subscriptions.resellerName,
	customer: subscriptions.customerName,
	pdm: subscriptions.pdmName,
	pmm: subscriptions.pmmName,
	region: subscriptions.region,
	type: subscriptions.type,
} as const;

export const DROPDOWN_FILTER_KEYS = Object.keys(
	DROPDOWN_FILTER_COLUMN_MAP,
) as DropdownFilterKey[];

export function normalizedSkuCategoryExpr(): SQL<string> {
	return sql<string>`CASE
	    WHEN ${subscriptions.skuCategory} IN ('Basic','Standard','Premium','E3','E5','Copilot','Other')
	    THEN ${subscriptions.skuCategory}
	    ELSE 'Other'
	  END`;
}

// ----- Smart filter SQL predicates -----

interface SmartBucket {
	label: string;
	predicate: SQL;
}

const SEAT_BUCKETS: SmartBucket[] = [
	{
		label: SeatRange.Seats1To24,
		predicate: sql`${subscriptions.seatCount} >= 1 AND ${subscriptions.seatCount} <= 24`,
	},
	{
		label: SeatRange.Seats25To49,
		predicate: sql`${subscriptions.seatCount} >= 25 AND ${subscriptions.seatCount} <= 49`,
	},
	{
		label: SeatRange.Seats50To99,
		predicate: sql`${subscriptions.seatCount} >= 50 AND ${subscriptions.seatCount} <= 99`,
	},
	{
		label: SeatRange.Seats100To299,
		predicate: sql`${subscriptions.seatCount} >= 100 AND ${subscriptions.seatCount} <= 299`,
	},
	{
		label: SeatRange.Seats300To499,
		predicate: sql`${subscriptions.seatCount} >= 300 AND ${subscriptions.seatCount} <= 499`,
	},
	{
		label: SeatRange.Seats500To999,
		predicate: sql`${subscriptions.seatCount} >= 500 AND ${subscriptions.seatCount} <= 999`,
	},
	{
		label: SeatRange.Seats1000Plus,
		predicate: sql`${subscriptions.seatCount} >= 1000`,
	},
];

const SKU_BUCKETS: SmartBucket[] = [
	{
		label: 'Business Basic',
		predicate: sql`${normalizedSkuCategoryExpr()} = 'Basic'`,
	},
	{
		label: 'Business Standard',
		predicate: sql`${normalizedSkuCategoryExpr()} = 'Standard'`,
	},
	{
		label: 'Business Premium',
		predicate: sql`${normalizedSkuCategoryExpr()} = 'Premium'`,
	},
];

const DAYS_UNTIL_RENEWAL = sql`(${subscriptions.renewalDate}::date - CURRENT_DATE)`;

const RENEWAL_BUCKETS: SmartBucket[] = [
	{
		label: 'Within 7 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} >= 0 AND ${DAYS_UNTIL_RENEWAL} <= 7`,
	},
	{
		label: 'Within 14 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} >= 0 AND ${DAYS_UNTIL_RENEWAL} <= 14`,
	},
	{
		label: 'Within 30 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} >= 0 AND ${DAYS_UNTIL_RENEWAL} <= 30`,
	},
	{
		label: 'Within 60 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} >= 0 AND ${DAYS_UNTIL_RENEWAL} <= 60`,
	},
	{
		label: 'Above 60 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} > 60`,
	},
];

const PAST_RENEWAL_BUCKETS: SmartBucket[] = [
	{
		label: 'Within 7 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} >= -7 AND ${DAYS_UNTIL_RENEWAL} < 0`,
	},
	{
		label: 'Within 14 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} >= -14 AND ${DAYS_UNTIL_RENEWAL} < 0`,
	},
	{
		label: 'Within 30 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} >= -30 AND ${DAYS_UNTIL_RENEWAL} < 0`,
	},
	{
		label: 'Within 60 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} >= -60 AND ${DAYS_UNTIL_RENEWAL} < 0`,
	},
	{
		label: 'Above 60 days',
		predicate: sql`${DAYS_UNTIL_RENEWAL} < -60`,
	},
];

export const SMART_FILTER_SQL_CONFIG = [
	{ key: 'skuCategory' as const, buckets: SKU_BUCKETS },
	{ key: 'expSeats' as const, buckets: SEAT_BUCKETS },
	{ key: 'renewalDate' as const, buckets: RENEWAL_BUCKETS },
	{ key: 'pastRenewalDate' as const, buckets: PAST_RENEWAL_BUCKETS },
];

function dashboardSearchTextExpr(): SQL<string> {
	return sql<string>`${subscriptions.customerName} || ' ' || ${subscriptions.resellerName} || ' ' || ${subscriptions.currentProduct}`;
}

// ----- WHERE clause builder -----

export function buildWhereClause(params: {
	filters: DashboardFilterState;
	search?: string;
	customerId?: string;
	excludeKey?: keyof DashboardFilterState;
}): SQL | undefined {
	const { filters, search, customerId, excludeKey } = params;
	const conditions: SQL[] = [];

	if (customerId) {
		conditions.push(eq(subscriptions.customerId, customerId));
	}

	for (const key of DROPDOWN_FILTER_KEYS) {
		if (key === excludeKey) continue;
		const values = filters[key];
		if (values.length === 0) continue;
		conditions.push(inArray(DROPDOWN_FILTER_COLUMN_MAP[key], values));
	}

	for (const dim of SMART_FILTER_SQL_CONFIG) {
		if (dim.key === excludeKey) continue;
		const selectedLabels = filters[dim.key];
		if (selectedLabels.length === 0) continue;

		const activeBuckets = dim.buckets.filter((b) =>
			selectedLabels.includes(b.label),
		);
		if (activeBuckets.length === 0) continue;

		if (activeBuckets.length === 1) {
			conditions.push(activeBuckets[0].predicate);
		} else {
			conditions.push(or(...activeBuckets.map((b) => b.predicate))!);
		}
	}

	if (search && search.trim().length > 0) {
		const escaped = search.trim().replaceAll('%', '\\%').replaceAll('_', '\\_');
		const pattern = `%${escaped}%`;
		conditions.push(sql`${dashboardSearchTextExpr()} ILIKE ${pattern}`);
	}

	if (conditions.length === 0) return undefined;
	if (conditions.length === 1) return conditions[0];
	return and(...conditions);
}

// ----- SQL expressions for grouped queries -----

export function nearestRenewalDateExpr(): SQL<string> {
	return sql<string>`COALESCE(
    MIN(${subscriptions.renewalDate}::date) FILTER (WHERE ${subscriptions.renewalDate}::date >= CURRENT_DATE),
    MAX(${subscriptions.renewalDate}::date)
  )::text`;
}

// ----- ORDER BY builders -----

export function buildOpportunityOrderBy(
	sortBy: string,
	sortDir: DashboardSortDirection,
): SQL {
	const dir = sortDir === 'ascending' ? asc : desc;
	switch (sortBy) {
		case 'customerName':
			return dir(subscriptions.customerName);
		case 'resellerName':
			return dir(subscriptions.resellerName);
		case 'currentProduct':
			return dir(subscriptions.currentProduct);
		case 'seatCount':
			return dir(subscriptions.seatCount);
		case 'renewalDate':
			return dir(sql`${subscriptions.renewalDate}::date`);
		case 'annualRevenueRunRate':
		default:
			return dir(subscriptions.annualRevenueRunRate);
	}
}

export function buildCustomerOrderBy(
	sortBy: string,
	sortDir: DashboardSortDirection,
): SQL {
	const dir = sortDir === 'ascending' ? asc : desc;
	switch (sortBy) {
		case 'customerName':
			return dir(sql`min(${subscriptions.customerName})`);
		case 'resellerName':
			return dir(sql`min(${subscriptions.resellerName})`);
		case 'totalSeats':
			return dir(sql`sum(${subscriptions.seatCount})`);
		case 'subscriptions':
			return dir(sql`count(*)`);
		case 'renewalDate':
			return dir(nearestRenewalDateExpr());
		case 'totalARR':
		default:
			return dir(sql`sum(${subscriptions.annualRevenueRunRate})`);
	}
}

export function buildResellerOrderBy(
	sortBy: string,
	sortDir: DashboardSortDirection,
): SQL {
	const dir = sortDir === 'ascending' ? asc : desc;
	switch (sortBy) {
		case 'resellerName':
			return dir(subscriptions.resellerName);
		case 'totalSeats':
			return dir(sql`sum(${subscriptions.seatCount})`);
		case 'customerCount':
			return dir(sql`count(distinct ${subscriptions.customerId})`);
		case 'subscriptions':
			return dir(sql`count(*)`);
		case 'renewalDate':
			return dir(nearestRenewalDateExpr());
		case 'totalARR':
		default:
			return dir(sql`sum(${subscriptions.annualRevenueRunRate})`);
	}
}
