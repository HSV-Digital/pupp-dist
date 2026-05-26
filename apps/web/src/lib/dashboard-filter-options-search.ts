import type { FilterState } from '@repo/types';
import { apiFetch } from '@/lib/api-client';

export const DASHBOARD_REMOTE_SEARCH_MIN_CHARS = 2;
export const DASHBOARD_REMOTE_SEARCH_LIMIT = 50;
export const DASHBOARD_REMOTE_SEARCH_DEBOUNCE_MS = 250;

const SEARCHABLE_DIMENSIONS = [
	'pssAIWorkforce',
	'pssAISecurity',
	'psa',
	'distributor',
	'reseller',
	'customer',
	'pdm',
	'pmm',
	'region',
	'type',
] as const;

const SEARCHABLE_DIMENSION_SET = new Set<string>(SEARCHABLE_DIMENSIONS);

interface DashboardOptionsSearchResponse {
	options?: string[];
}

export type SearchableFilterDimension = (typeof SEARCHABLE_DIMENSIONS)[number];

export function isSearchableFilterDimension(
	dimension: keyof FilterState,
): dimension is SearchableFilterDimension {
	return SEARCHABLE_DIMENSION_SET.has(dimension);
}

export function createDashboardOptionsSearchPath(params: {
	dimension: SearchableFilterDimension;
	query: string;
	filters: FilterState;
	limit?: number;
}): string {
	const query = params.query.trim();
	const qs = new URLSearchParams({
		dimension: params.dimension,
		q: query,
		limit: `${params.limit ?? DASHBOARD_REMOTE_SEARCH_LIMIT}`,
	});

	for (const [key, values] of Object.entries(params.filters) as Array<
		[keyof FilterState, string[]]
	>) {
		for (const value of values) {
			qs.append(key, value);
		}
	}

	return `/api/dashboard/options?${qs.toString()}`;
}

export async function fetchDashboardFilterOptions(params: {
	dimension: SearchableFilterDimension;
	query: string;
	filters: FilterState;
	signal?: AbortSignal;
	limit?: number;
}): Promise<string[]> {
	const path = createDashboardOptionsSearchPath(params);
	const response = await apiFetch(path, {
		method: 'GET',
		signal: params.signal,
	});

	if (!response.ok) {
		throw new Error(`Failed to load dashboard filter options (${response.status})`);
	}

	const payload = (await response.json()) as DashboardOptionsSearchResponse;
	return Array.isArray(payload.options) ? payload.options : [];
}
