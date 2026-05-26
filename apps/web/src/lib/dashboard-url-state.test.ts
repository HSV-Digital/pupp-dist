import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	EMPTY_DASHBOARD_FILTERS,
	loadDiscoverSessionState,
} from './dashboard-url-state';

const DISCOVER_SESSION_STORAGE_KEY = 'dashboard:discover-state';

describe('loadDiscoverSessionState', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		sessionStorage.clear();
	});

	beforeEach(() => {
		sessionStorage.clear();
	});

	it('returns empty defaults when window is unavailable', () => {
		vi.stubGlobal('window', undefined);

		expect(loadDiscoverSessionState()).toEqual({
			searchTerm: '',
			filters: EMPTY_DASHBOARD_FILTERS,
		});
	});

	it('returns empty defaults when nothing is stored', () => {
		expect(loadDiscoverSessionState()).toEqual({
			searchTerm: '',
			filters: EMPTY_DASHBOARD_FILTERS,
		});
	});

	it('restores valid stored values and fills missing filter keys', () => {
		const storedState = {
			searchTerm: 'contoso',
			filters: {
				customer: ['Contoso'],
				region: ['United States'],
			},
		};

		sessionStorage.setItem(
			DISCOVER_SESSION_STORAGE_KEY,
			JSON.stringify(storedState),
		);

		expect(loadDiscoverSessionState()).toEqual({
			searchTerm: 'contoso',
			filters: {
				...EMPTY_DASHBOARD_FILTERS,
				customer: ['Contoso'],
				region: ['United States'],
			},
		});
	});

	it('drops malformed stored filter values and non-string entries', () => {
		sessionStorage.setItem(
			DISCOVER_SESSION_STORAGE_KEY,
			JSON.stringify({
				searchTerm: 'northwind',
				filters: {
					customer: ['Northwind', 123],
					reseller: 'Reseller A',
					expSeats: [null, '1000+'],
				},
			}),
		);

		expect(loadDiscoverSessionState()).toEqual({
			searchTerm: 'northwind',
			filters: {
				...EMPTY_DASHBOARD_FILTERS,
				customer: ['Northwind'],
				expSeats: ['1000+'],
			},
		});
	});

	it('returns fresh filter arrays instead of reusing the shared defaults', () => {
		const result = loadDiscoverSessionState();

		expect(result.filters).not.toBe(EMPTY_DASHBOARD_FILTERS);
		expect(result.filters.customer).not.toBe(EMPTY_DASHBOARD_FILTERS.customer);
		expect(result.filters.region).not.toBe(EMPTY_DASHBOARD_FILTERS.region);
	});
});
