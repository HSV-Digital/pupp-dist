import { describe, expect, it } from 'vitest';
import {
	hasPendingDashboardInputs,
	resolveDashboardIncludeParts,
	type DashboardFetchContext,
} from './dashboard-fetch-planner';

function makeContext(
	overrides: Partial<DashboardFetchContext> = {},
): DashboardFetchContext {
	return {
		viewMode: 'customer',
		filtersKey: '{"reseller":[]}',
		search: '',
		page: 1,
		sortBy: 'totalARR',
		sortDir: 'descending',
		...overrides,
	};
}

describe('resolveDashboardIncludeParts', () => {
	it('returns full payload on initial load', () => {
		const parts = resolveDashboardIncludeParts({
			previousContext: null,
			nextContext: makeContext(),
		});

		expect(parts).toEqual(['rows', 'summary', 'options']);
	});

	it('returns full payload when filters change', () => {
		const parts = resolveDashboardIncludeParts({
			previousContext: makeContext({ filtersKey: '{"reseller":[]}' }),
			nextContext: makeContext({ filtersKey: '{"reseller":["A"]}' }),
		});

		expect(parts).toEqual(['rows', 'summary', 'options']);
	});

	it('returns rows and summary when search changes', () => {
		const parts = resolveDashboardIncludeParts({
			previousContext: makeContext({ search: '' }),
			nextContext: makeContext({ search: 'contoso' }),
		});

		expect(parts).toEqual(['rows', 'summary']);
	});

	it('returns rows only for pagination or sort changes', () => {
		const parts = resolveDashboardIncludeParts({
			previousContext: makeContext({ page: 1 }),
			nextContext: makeContext({ page: 2 }),
		});

		expect(parts).toEqual(['rows']);
	});
});

describe('hasPendingDashboardInputs', () => {
	it('returns true while debounced filters are not caught up', () => {
		expect(
			hasPendingDashboardInputs({
				currentFiltersKey: '{"customer":["A"]}',
				debouncedFiltersKey: '{"customer":[]}',
				searchTerm: '',
				debouncedSearch: '',
			}),
		).toBe(true);
	});

	it('returns true while debounced search is not caught up', () => {
		expect(
			hasPendingDashboardInputs({
				currentFiltersKey: '{"customer":[]}',
				debouncedFiltersKey: '{"customer":[]}',
				searchTerm: 'con',
				debouncedSearch: 'co',
			}),
		).toBe(true);
	});

	it('returns false when no debounce lag remains', () => {
		expect(
			hasPendingDashboardInputs({
				currentFiltersKey: '{"customer":[]}',
				debouncedFiltersKey: '{"customer":[]}',
				searchTerm: 'contoso',
				debouncedSearch: 'contoso',
			}),
		).toBe(false);
	});
});
