import { useState, useEffect, useCallback } from 'react';
import {
	compareSeatRanges,
	formatEstimatedSeatCount,
	toSeatRange,
} from '@repo/shared';
import type {
	RenewalSubscription,
	DashboardCustomerRow,
	DashboardResellerRow,
	DashboardApiSummary,
	FilterState,
	DashboardSortDirection,
	SkuCategory,
} from '@repo/types';
import {
	DROPDOWN_FILTER_FIELD_MAP,
	SMART_FILTER_CONFIG,
} from '@/lib/filter-utils';
import { formatMonthYear } from '@/lib/format-utils';

const DEMO_SESSION_KEY = 'demo-added-customers';

// ── Module-level cache ──────────────────────────────────────────────
let _cache: RenewalSubscription[] | null = null;

// ── Pure data functions ─────────────────────────────────────────────

export function buildDemoCustomerRows(
	subscriptions: RenewalSubscription[],
): DashboardCustomerRow[] {
	const map = new Map<
		string,
		{
			customerId: string;
			customerName: string;
			resellerName: string;
			distributorName: string;
			totalSeats: number;
			subscriptionCount: number;
			skuSet: Set<SkuCategory>;
			earliestRenewal: string;
		}
	>();

	for (const sub of subscriptions) {
		const existing = map.get(sub.customerId);
		if (existing) {
			existing.totalSeats += sub.seatCount;
			existing.subscriptionCount += 1;
			existing.skuSet.add(sub.skuCategory);
			if (sub.renewalDate < existing.earliestRenewal) {
				existing.earliestRenewal = sub.renewalDate;
			}
		} else {
			map.set(sub.customerId, {
				customerId: sub.customerId,
				customerName: sub.customerName,
				resellerName: sub.resellerName,
				distributorName: sub.distributorName,
				totalSeats: sub.seatCount,
				subscriptionCount: 1,
				skuSet: new Set([sub.skuCategory]),
				earliestRenewal: sub.renewalDate,
			});
		}
	}

	return [...map.values()].map((c) => ({
		customerId: c.customerId,
		customerName: c.customerName,
		resellerName: c.resellerName,
		distributorName: c.distributorName,
		totalSeatsRange: toSeatRange(c.totalSeats),
		subscriptionCount: c.subscriptionCount,
		subscriptionSkuCategories: [...c.skuSet] as SkuCategory[],
		renewalDate: c.earliestRenewal,
		closestRenewalLabel: formatMonthYear(c.earliestRenewal),
	}));
}

export function buildDemoResellerRows(
	subscriptions: RenewalSubscription[],
): DashboardResellerRow[] {
	const map = new Map<
		string,
		{
			resellerName: string;
			totalSeats: number;
			totalARR: number;
			customerIds: Set<string>;
			subscriptionCount: number;
			earliestRenewal: string;
		}
	>();

	for (const sub of subscriptions) {
		const existing = map.get(sub.resellerName);
		if (existing) {
			existing.totalSeats += sub.seatCount;
			existing.totalARR += sub.annualRevenueRunRate;
			existing.customerIds.add(sub.customerId);
			existing.subscriptionCount += 1;
			if (sub.renewalDate < existing.earliestRenewal) {
				existing.earliestRenewal = sub.renewalDate;
			}
		} else {
			map.set(sub.resellerName, {
				resellerName: sub.resellerName,
				totalSeats: sub.seatCount,
				totalARR: sub.annualRevenueRunRate,
				customerIds: new Set([sub.customerId]),
				subscriptionCount: 1,
				earliestRenewal: sub.renewalDate,
			});
		}
	}

	return [...map.values()].map((r) => ({
		resellerName: r.resellerName,
		totalSeatsRange: toSeatRange(r.totalSeats),
		customerCount: r.customerIds.size,
		subscriptionCount: r.subscriptionCount,
		renewalDate: r.earliestRenewal,
		closestRenewalLabel: formatMonthYear(r.earliestRenewal),
	}));
}

export function buildDemoSummary(
	subscriptions: RenewalSubscription[],
): DashboardApiSummary {
	const customerIds = new Set<string>();
	const resellerNames = new Set<string>();
	let totalSeats = 0;
	let copilotOpportunities = 0;

	for (const sub of subscriptions) {
		customerIds.add(sub.customerId);
		resellerNames.add(sub.resellerName);
		totalSeats += sub.seatCount;
		if (!sub.hasCopilot) copilotOpportunities++;
	}

	return {
		totalRenewals: subscriptions.length,
		totalSeats,
		totalSeatsDisplay: formatEstimatedSeatCount(totalSeats),
		copilotOpportunities,
		totalCustomers: customerIds.size,
		totalResellers: resellerNames.size,
	};
}

export function filterSubscriptions(
	subscriptions: RenewalSubscription[],
	filters: FilterState,
	searchTerm: string,
): RenewalSubscription[] {
	let result = subscriptions;

	const needle = searchTerm.trim().toLowerCase();
	if (needle) {
		result = result.filter(
			(sub) =>
				sub.customerName.toLowerCase().includes(needle) ||
				sub.resellerName.toLowerCase().includes(needle) ||
				sub.currentProduct.toLowerCase().includes(needle),
		);
	}

	// Dropdown filters
	for (const [filterKey, field] of Object.entries(DROPDOWN_FILTER_FIELD_MAP)) {
		const values = filters[filterKey as keyof FilterState];
		if (!values || values.length === 0) continue;
		result = result.filter((sub) => {
			const val = sub[field as keyof RenewalSubscription] as string;
			return val != null && values.includes(val);
		});
	}

	// Smart filters
	for (const dim of SMART_FILTER_CONFIG) {
		const values = filters[dim.key];
		if (!values || values.length === 0) continue;
		const activeBuckets = dim.buckets.filter((b) => values.includes(b.label));
		result = result.filter((sub) =>
			activeBuckets.some((b) => b.predicate(sub)),
		);
	}

	return result;
}

export function sortRows<T>(
	rows: T[],
	sortBy: string,
	sortDir: DashboardSortDirection,
): T[] {
	if (!sortBy) return rows;

	const normalizedSortBy = sortBy === 'totalSeats' ? 'totalSeatsRange' : sortBy;

	const sorted = [...rows].sort((a, b) => {
		const aVal = (a as Record<string, unknown>)[normalizedSortBy];
		const bVal = (b as Record<string, unknown>)[normalizedSortBy];

		if (
			normalizedSortBy === 'totalSeatsRange' &&
			typeof aVal === 'string' &&
			typeof bVal === 'string'
		) {
			return compareSeatRanges(
				aVal as Parameters<typeof compareSeatRanges>[0],
				bVal as Parameters<typeof compareSeatRanges>[1],
			);
		}
		if (typeof aVal === 'string' && typeof bVal === 'string') {
			return aVal.localeCompare(bVal);
		}
		if (typeof aVal === 'number' && typeof bVal === 'number') {
			return aVal - bVal;
		}
		// Date strings for renewalDate
		if (
			normalizedSortBy === 'renewalDate' &&
			typeof aVal === 'string' &&
			typeof bVal === 'string'
		) {
			return new Date(aVal).getTime() - new Date(bVal).getTime();
		}
		return 0;
	});

	if (sortDir === 'descending') sorted.reverse();
	return sorted;
}

export function paginateRows<T>(
	rows: T[],
	page: number,
	pageSize: number,
): T[] {
	const start = (page - 1) * pageSize;
	return rows.slice(start, start + pageSize);
}

export function getCustomerSubscriptions(
	subscriptions: RenewalSubscription[],
	customerId: string,
): RenewalSubscription[] {
	return subscriptions.filter((s) => s.customerId === customerId);
}

export function searchFilterOptions(
	subscriptions: RenewalSubscription[],
	dimension: string,
	query: string,
): string[] {
	const field = DROPDOWN_FILTER_FIELD_MAP[dimension as keyof FilterState];
	if (!field) return [];

	const needle = query.trim().toLowerCase();
	if (!needle) return [];

	const matches = new Set<string>();
	for (const sub of subscriptions) {
		const val = sub[field as keyof RenewalSubscription] as string;
		if (val && val.toLowerCase().includes(needle)) {
			matches.add(val);
		}
	}

	return [...matches].sort().slice(0, 50);
}

// ── Added customers via sessionStorage ──────────────────────────────

export function readDemoAddedCustomers(): RenewalSubscription[] {
	try {
		const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as RenewalSubscription[];
	} catch {
		return [];
	}
}

export function writeDemoAddedCustomer(sub: RenewalSubscription): void {
	const existing = readDemoAddedCustomers();
	existing.push(sub);
	sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(existing));
}

// ── Customer snapshot for proposal/assets pages ─────────────────────

const DEMO_CUSTOMER_SNAPSHOT_KEY = 'demo-customer-snapshot';

export interface DemoCustomerSnapshot {
	customerId: string;
	customerName: string;
	subscriptions: RenewalSubscription[];
}

export function writeDemoCustomerSnapshot(
	snapshot: DemoCustomerSnapshot,
): void {
	sessionStorage.setItem(DEMO_CUSTOMER_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function readDemoCustomerSnapshot(): DemoCustomerSnapshot | null {
	try {
		const raw = sessionStorage.getItem(DEMO_CUSTOMER_SNAPSHOT_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as DemoCustomerSnapshot;
	} catch {
		return null;
	}
}

// ── React hook ──────────────────────────────────────────────────────

export function useDemoDataset() {
	const [subscriptions, setSubscriptions] = useState<RenewalSubscription[]>(
		_cache ?? [],
	);
	const [isLoading, setIsLoading] = useState(!_cache);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (_cache) {
			// Merge in any added customers
			const added = readDemoAddedCustomers();
			if (added.length > 0) {
				setSubscriptions([..._cache, ...added]);
			}
			return;
		}

		let cancelled = false;

		fetch('/demo/demo-subscriptions.json')
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data: RenewalSubscription[]) => {
				if (cancelled) return;
				_cache = data;
				const added = readDemoAddedCustomers();
				setSubscriptions([...data, ...added]);
				setIsLoading(false);
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setError(err.message);
				setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	const refreshAdded = useCallback(() => {
		if (_cache) {
			const added = readDemoAddedCustomers();
			setSubscriptions([..._cache, ...added]);
		}
	}, []);

	return { subscriptions, isLoading, error, refreshAdded };
}
