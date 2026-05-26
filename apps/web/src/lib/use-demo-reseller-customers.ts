'use client';

import { useCallback, useEffect, useState } from 'react';
import {
	useQueryStates,
	parseAsString,
	parseAsStringLiteral,
	parseAsInteger,
} from 'nuqs';
import { demoResellerApiFetch } from './demo-reseller-api-client';
import {
	mapSortColumn,
	type ResellerCustomersFilters,
	type ResellerCustomersResponse,
	type ResellerCustomerSummary,
	type ResellerDashboardCustomer,
	type ResellerSubscription,
	type UseResellerCustomersReturn,
} from './use-reseller-customers';

const SORT_DIRECTIONS = ['ascending', 'descending'] as const;

const demoResellerTableParsers = {
	sortBy: parseAsString.withDefault('totalArr'),
	sortDir: parseAsStringLiteral(SORT_DIRECTIONS).withDefault('descending'),
	page: parseAsInteger.withDefault(1),
};

const demoResellerTableUrlKeys = {
	sortBy: 'sb',
	sortDir: 'sd',
	page: 'p',
} as const;

const DEFAULT_PAGE_SIZE = 20;

interface CreateResellerCustomerInput {
	customerName: string;
	customerTpid?: string;
	countryName: string;
	renewalDate?: string;
	renewalMonth?: string;
	subscriptionName?: string;
	licenseCount?: number;
}

function appendQueryArray(
	params: URLSearchParams,
	key: string,
	values?: string[],
): void {
	if (!values?.length) {
		return;
	}

	for (const value of values) {
		params.append(key, value);
	}
}

export function useDemoResellerCustomers(
	filters?: ResellerCustomersFilters,
): UseResellerCustomersReturn {
	const [customers, setCustomers] = useState<ResellerDashboardCustomer[]>([]);
	const [total, setTotal] = useState(0);
	const [summary, setSummary] = useState<ResellerCustomerSummary | null>(null);
	const [availableOptions, setAvailableOptions] = useState<
		Record<string, string[]>
	>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshCounter, setRefreshCounter] = useState(0);

	const [tableState, setTableState] = useQueryStates(demoResellerTableParsers, {
		urlKeys: demoResellerTableUrlKeys,
		history: 'replace',
	});
	const page = tableState.page;
	const sortBy = tableState.sortBy;
	const sortDir = tableState.sortDir as 'ascending' | 'descending';

	const filtersKey = filters ? JSON.stringify(filters) : '';
	useEffect(() => {
		void setTableState({ page: 1 });
	}, [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps

	const setPage = useCallback(
		(p: number) => {
			void setTableState({ page: p });
		},
		[setTableState],
	);

	useEffect(() => {
		const abortController = new AbortController();

		const run = async () => {
			setLoading(true);
			setError(null);

			try {
				const params = new URLSearchParams();
				params.set('page', String(page));
				params.set('pageSize', String(DEFAULT_PAGE_SIZE));
				params.set('includeParts', 'summary,options');
				params.set('sortBy', mapSortColumn(sortBy));
				params.set('sortDir', sortDir);

				appendQueryArray(params, 'customerName', filters?.customerName);
				appendQueryArray(params, 'currentSku', filters?.currentSku);
				appendQueryArray(params, 'region', filters?.region);
				appendQueryArray(params, 'seats', filters?.seats);
				appendQueryArray(params, 'currentArr', filters?.currentArr);
				appendQueryArray(params, 'renewalDate', filters?.renewalDate);
				appendQueryArray(params, 'copilotFit', filters?.copilotFit);
				appendQueryArray(params, 'copilotIntent', filters?.copilotIntent);
				appendQueryArray(params, 'copilotCluster', filters?.copilotCluster);
				appendQueryArray(params, 'hasCompete', filters?.hasCompete);
				appendQueryArray(params, 'distributorName', filters?.distributorName);
				appendQueryArray(params, 'customerTpid', filters?.customerTpid);
				appendQueryArray(
					params,
					'copilotChatToPaid',
					filters?.copilotChatToPaid,
				);
				appendQueryArray(
					params,
					'mwPaidSeatRange',
					filters?.mwPaidSeatRange,
				);

				const response = await demoResellerApiFetch(
					`/customers?${params.toString()}`,
					{ signal: abortController.signal },
				);

				if (!response.ok) {
					throw new Error(`Failed to fetch customers: ${response.status}`);
				}

				const data: ResellerCustomersResponse = await response.json();
				if (!abortController.signal.aborted) {
					setCustomers(data.rows);
					setTotal(data.total);
					setSummary(data.summary ?? null);
					setAvailableOptions(data.availableOptions ?? {});
				}
			} catch (err) {
				if (abortController.signal.aborted) return;
				setError(
					err instanceof Error ? err.message : 'Failed to load customers',
				);
			} finally {
				if (!abortController.signal.aborted) {
					setLoading(false);
				}
			}
		};

		void run();
		return () => abortController.abort();
	}, [page, filtersKey, sortBy, sortDir, refreshCounter]);

	const triggerRefresh = useCallback(() => {
		setRefreshCounter((c) => c + 1);
	}, []);

	const fetchCustomers = useCallback(
		async (overrideFilters?: ResellerCustomersFilters) => {
			if (overrideFilters) {
				setLoading(true);
				setError(null);
				try {
					const params = new URLSearchParams();
					params.set('page', String(page));
					params.set('pageSize', String(DEFAULT_PAGE_SIZE));
					params.set('includeParts', 'summary,options');
					params.set('sortBy', mapSortColumn(sortBy));
					params.set('sortDir', sortDir);

					appendQueryArray(
						params,
						'customerName',
						overrideFilters.customerName,
					);
					appendQueryArray(params, 'currentSku', overrideFilters.currentSku);
					appendQueryArray(params, 'region', overrideFilters.region);
					appendQueryArray(params, 'seats', overrideFilters.seats);
					appendQueryArray(params, 'currentArr', overrideFilters.currentArr);
					appendQueryArray(params, 'renewalDate', overrideFilters.renewalDate);
					appendQueryArray(params, 'copilotFit', overrideFilters.copilotFit);
					appendQueryArray(
						params,
						'copilotIntent',
						overrideFilters.copilotIntent,
					);
					appendQueryArray(
						params,
						'copilotCluster',
						overrideFilters.copilotCluster,
					);
					appendQueryArray(params, 'hasCompete', overrideFilters.hasCompete);
					appendQueryArray(
						params,
						'distributorName',
						overrideFilters.distributorName,
					);
					appendQueryArray(
						params,
						'customerTpid',
						overrideFilters.customerTpid,
					);
					appendQueryArray(
						params,
						'copilotChatToPaid',
						overrideFilters.copilotChatToPaid,
					);
					appendQueryArray(
						params,
						'mwPaidSeatRange',
						overrideFilters.mwPaidSeatRange,
					);

					const response = await demoResellerApiFetch(
						`/customers?${params.toString()}`,
					);
					if (!response.ok) {
						throw new Error(`Failed to fetch customers: ${response.status}`);
					}
					const data: ResellerCustomersResponse = await response.json();
					setCustomers(data.rows);
					setTotal(data.total);
					setSummary(data.summary ?? null);
					setAvailableOptions(data.availableOptions ?? {});
				} catch (err) {
					setError(
						err instanceof Error ? err.message : 'Failed to load customers',
					);
				} finally {
					setLoading(false);
				}
			} else {
				triggerRefresh();
			}
		},
		[page, sortBy, sortDir, triggerRefresh],
	);

	const addCustomer = useCallback(
		async (data: CreateResellerCustomerInput): Promise<ResellerSubscription> => {
			const response = await demoResellerApiFetch('/customers', {
				method: 'POST',
				body: JSON.stringify(data),
			});

			if (!response.ok) {
				throw new Error(`Failed to create customer: ${response.status}`);
			}

			const created: ResellerSubscription = await response.json();
			await fetchCustomers();
			return created;
		},
		[fetchCustomers],
	);

	const setSort = useCallback(
		(nextSortBy: string, nextSortDir: 'ascending' | 'descending') => {
			void setTableState({
				sortBy: nextSortBy,
				sortDir: nextSortDir,
				page: 1,
			});
		},
		[setTableState],
	);

	const removeCustomer = useCallback(
		async (id: string): Promise<void> => {
			const response = await demoResellerApiFetch(`/customers/${id}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				throw new Error(`Failed to delete customer: ${response.status}`);
			}

			await fetchCustomers();
		},
		[fetchCustomers],
	);

	return {
		customers,
		total,
		summary,
		availableOptions,
		loading,
		error,
		page,
		pageSize: DEFAULT_PAGE_SIZE,
		setPage,
		sortBy,
		sortDir,
		setSort,
		addCustomer,
		removeCustomer,
		refresh: fetchCustomers,
	};
}
