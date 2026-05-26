import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FilterState } from '@repo/types';
import {
	createDashboardOptionsSearchPath,
	fetchDashboardFilterOptions,
	isSearchableFilterDimension,
} from './dashboard-filter-options-search';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api-client', () => ({
	apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const EMPTY_FILTERS: FilterState = {
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

describe('dashboard filter options search helpers', () => {
	afterEach(() => {
		apiFetchMock.mockReset();
		vi.restoreAllMocks();
	});

	it('builds path with trimmed query and selected filter values', () => {
		const path = createDashboardOptionsSearchPath({
			dimension: 'customer',
			query: '  cont  ',
			limit: 25,
			filters: {
				...EMPTY_FILTERS,
				distributor: ['Dist A'],
				region: ['North America', 'EMEA'],
			},
		});

		const url = new URL(path, 'https://example.test');
		expect(url.pathname).toBe('/api/dashboard/options');
		expect(url.searchParams.get('dimension')).toBe('customer');
		expect(url.searchParams.get('q')).toBe('cont');
		expect(url.searchParams.get('limit')).toBe('25');
		expect(url.searchParams.getAll('distributor')).toEqual(['Dist A']);
		expect(url.searchParams.getAll('region')).toEqual([
			'North America',
			'EMEA',
		]);
	});

	it('flags only dropdown dimensions as searchable', () => {
		expect(isSearchableFilterDimension('customer')).toBe(true);
		expect(isSearchableFilterDimension('type')).toBe(true);
		expect(isSearchableFilterDimension('skuCategory')).toBe(false);
		expect(isSearchableFilterDimension('expSeats')).toBe(false);
		expect(isSearchableFilterDimension('renewalDate')).toBe(false);
	});

	it('fetches options through the authenticated proxy', async () => {
		apiFetchMock.mockResolvedValue(
			new Response(JSON.stringify({ options: ['Seattle'] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}),
		);

		const result = await fetchDashboardFilterOptions({
			dimension: 'customer',
			query: 'sea',
			filters: EMPTY_FILTERS,
		});

		expect(result).toEqual(['Seattle']);
		expect(apiFetchMock).toHaveBeenCalledTimes(1);

		const [url, init] = apiFetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('/api/dashboard/options?');
		expect(init.method).toBe('GET');
	});
});
