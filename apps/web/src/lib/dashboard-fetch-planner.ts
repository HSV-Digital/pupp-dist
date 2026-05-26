import type { DashboardSortDirection, DashboardViewMode } from '@repo/types';

export type DashboardIncludePart = 'rows' | 'summary' | 'options';

export interface DashboardFetchContext {
	viewMode: DashboardViewMode;
	filtersKey: string;
	search: string;
	page: number;
	sortBy: string;
	sortDir: DashboardSortDirection;
}

interface ResolveDashboardIncludePartsParams {
	previousContext: DashboardFetchContext | null;
	nextContext: DashboardFetchContext;
}

interface HasPendingDashboardInputsParams {
	currentFiltersKey: string;
	debouncedFiltersKey: string;
	searchTerm: string;
	debouncedSearch: string;
}

const FULL_INCLUDE_PARTS: DashboardIncludePart[] = [
	'rows',
	'summary',
	'options',
];
const ROWS_AND_SUMMARY_PARTS: DashboardIncludePart[] = ['rows', 'summary'];
const ROWS_ONLY_PARTS: DashboardIncludePart[] = ['rows'];

export function resolveDashboardIncludeParts(
	params: ResolveDashboardIncludePartsParams,
): DashboardIncludePart[] {
	const { previousContext, nextContext } = params;

	if (!previousContext) {
		return FULL_INCLUDE_PARTS;
	}

	if (previousContext.filtersKey !== nextContext.filtersKey) {
		return FULL_INCLUDE_PARTS;
	}

	if (previousContext.search !== nextContext.search) {
		return ROWS_AND_SUMMARY_PARTS;
	}

	return ROWS_ONLY_PARTS;
}

export function hasPendingDashboardInputs(
	params: HasPendingDashboardInputsParams,
): boolean {
	const {
		currentFiltersKey,
		debouncedFiltersKey,
		searchTerm,
		debouncedSearch,
	} = params;

	return (
		currentFiltersKey !== debouncedFiltersKey || searchTerm !== debouncedSearch
	);
}
