import { parseAsInteger, parseAsString, parseAsStringLiteral } from 'nuqs';
import type { FilterState } from '@repo/types';

// ── View modes & sort directions ────────────────────────────────────

const VIEW_MODES = ['customer', 'reseller', 'opportunity'] as const;
const SORT_DIRECTIONS = ['ascending', 'descending'] as const;
const DASHBOARD_TABS = ['discover', 'my-customers'] as const;
const DISCOVER_SESSION_STORAGE_KEY = 'dashboard:discover-state';
const MY_CUSTOMERS_SESSION_STORAGE_KEY = 'dashboard:my-customers-state';

// ── Filter key → URL key mapping ────────────────────────────────────

export const FILTER_URL_KEYS = {
	pssAIWorkforce: 'fw',
	pssAISecurity: 'fs',
	psa: 'psa',
	distributor: 'dist',
	reseller: 'res',
	customer: 'cust',
	pdm: 'pdm',
	pmm: 'pmm',
	region: 'rgn',
	type: 'typ',
	skuCategory: 'sku',
	expSeats: 'es',
	renewalDate: 'rd',
	pastRenewalDate: 'prd',
} as const satisfies Record<keyof FilterState, string>;

export const FILTER_KEYS = Object.keys(
	FILTER_URL_KEYS,
) as (keyof FilterState)[];

// ── Parsers for the "discover" tab (used in use-dashboard-api) ──────

export const discoverParsers = {
	viewMode: parseAsStringLiteral(VIEW_MODES).withDefault('customer'),
	page: parseAsInteger.withDefault(1),
	sortBy: parseAsString.withDefault('totalSeats'),
	sortDir: parseAsStringLiteral(SORT_DIRECTIONS).withDefault('descending'),
};

export const discoverUrlKeys = {
	viewMode: 'vm',
	page: 'p',
	sortBy: 'sb',
	sortDir: 'sd',
} as const;

// ── Parsers for page-level state (tab + my-customers filters) ───────

export const pageParsers = {
	dashboardTab: parseAsStringLiteral(DASHBOARD_TABS).withDefault('discover'),
};

export const pageUrlKeys = {
	dashboardTab: 'tab',
} as const;

// ── Helpers ─────────────────────────────────────────────────────────

export const EMPTY_DASHBOARD_FILTERS: FilterState = {
	pssAIWorkforce: [],
	pssAISecurity: [],
	psa: [],
	distributor: [],
	reseller: [],
	customer: [],
	pdm: [],
	pmm: [],
	region: [],
	type: [],
	skuCategory: [],
	expSeats: [],
	renewalDate: [],
	pastRenewalDate: [],
};

export interface DiscoverSessionState {
	searchTerm: string;
	filters: FilterState;
}

export interface MyCustomersSessionState {
	customerName: string[];
	partnerName: string[];
	currentSku: string[];
}

export const EMPTY_MY_CUSTOMERS_FILTERS: MyCustomersSessionState = {
	customerName: [],
	partnerName: [],
	currentSku: [],
};

function safeParseStorageValue<T>(rawValue: string | null): T | null {
	if (!rawValue) {
		return null;
	}

	try {
		return JSON.parse(rawValue) as T;
	} catch {
		return null;
	}
}

function normalizeDiscoverFilters(storedFilters: unknown): FilterState {
	const filters: FilterState = { ...EMPTY_DASHBOARD_FILTERS };

	if (!storedFilters || typeof storedFilters !== 'object') {
		for (const key of FILTER_KEYS) {
			filters[key] = [...EMPTY_DASHBOARD_FILTERS[key]];
		}
		return filters;
	}

	const storedRecord = storedFilters as Partial<
		Record<keyof FilterState, unknown>
	>;
	for (const key of FILTER_KEYS) {
		const value = storedRecord[key];
		filters[key] = Array.isArray(value)
			? value.filter((entry): entry is string => typeof entry === 'string')
			: [...EMPTY_DASHBOARD_FILTERS[key]];
	}

	return filters;
}

export function loadDiscoverSessionState(): DiscoverSessionState {
	if (typeof window === 'undefined') {
		return {
			searchTerm: '',
			filters: normalizeDiscoverFilters(undefined),
		};
	}

	const stored = safeParseStorageValue<Partial<DiscoverSessionState>>(
		window.sessionStorage.getItem(DISCOVER_SESSION_STORAGE_KEY),
	);

	return {
		searchTerm: typeof stored?.searchTerm === 'string' ? stored.searchTerm : '',
		filters: normalizeDiscoverFilters(stored?.filters),
	};
}

export function persistDiscoverSessionState(state: DiscoverSessionState): void {
	if (typeof window === 'undefined') {
		return;
	}

	window.sessionStorage.setItem(
		DISCOVER_SESSION_STORAGE_KEY,
		JSON.stringify(state),
	);
}

export function loadMyCustomersSessionState(): MyCustomersSessionState {
	if (typeof window === 'undefined') {
		return EMPTY_MY_CUSTOMERS_FILTERS;
	}

	const stored = safeParseStorageValue<Partial<MyCustomersSessionState>>(
		window.sessionStorage.getItem(MY_CUSTOMERS_SESSION_STORAGE_KEY),
	);

	return {
		customerName: Array.isArray(stored?.customerName)
			? stored.customerName
			: EMPTY_MY_CUSTOMERS_FILTERS.customerName,
		partnerName: Array.isArray(stored?.partnerName)
			? stored.partnerName
			: EMPTY_MY_CUSTOMERS_FILTERS.partnerName,
		currentSku: Array.isArray(stored?.currentSku)
			? stored.currentSku
			: EMPTY_MY_CUSTOMERS_FILTERS.currentSku,
	};
}

export function persistMyCustomersSessionState(
	state: MyCustomersSessionState,
): void {
	if (typeof window === 'undefined') {
		return;
	}

	window.sessionStorage.setItem(
		MY_CUSTOMERS_SESSION_STORAGE_KEY,
		JSON.stringify(state),
	);
}
