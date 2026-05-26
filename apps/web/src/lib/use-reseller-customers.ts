'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SeatRangeValue } from '@repo/types';
import {
	useQueryStates,
	parseAsString,
	parseAsStringLiteral,
	parseAsInteger,
} from 'nuqs';
import { useResellerAuth } from './reseller-auth-context';
import { resellerApiFetch } from './reseller-api-client';

const SORT_DIRECTIONS = ['ascending', 'descending'] as const;

const resellerTableParsers = {
	sortBy: parseAsString.withDefault('totalArr'),
	sortDir: parseAsStringLiteral(SORT_DIRECTIONS).withDefault('descending'),
	page: parseAsInteger.withDefault(1),
};

const resellerTableUrlKeys = {
	sortBy: 'sb',
	sortDir: 'sd',
	page: 'p',
} as const;

export function mapSortColumn(column: string): string {
	switch (column) {
		case 'totalArr':
			return 'currentArr';
		case 'subscriptions':
			return 'subscriptionCount';
		default:
			return column;
	}
}

export interface ResellerSubscription {
	id: string;
	orgId: string;
	customerName: string;
	customerTpid: string | null;
	renewalDate: string | null;
	renewalMonth: string | null;
	seats: number;
	currentArr: number;
	currentSku: string;
	region: string;
	costPerUser: number;
	distributorName: string | null;
	distributorId: string | null;
	partnerName: string | null;
	partnerGlobalId: string | null;
	mpnId: string | null;
	copilotFit: string | null;
	copilotIntent: string | null;
	copilotCluster: string | null;
	copilotEligibleM365Seats: number | null;
	freeCopilotChatMAU: number | null;
	copilotMAUPercentage: number | null;
	copilotSeatsWhitespace: number | null;
	allAgentMAU: number | null;
	mciEligibility: number | null;
	mciEngagementName: string | null;
	adoptionStatus: string | null;
	mwPaidSeatRange: string | null;
	hasTransactedProduct: string | null;
	hasCompete: string | null;
	tenantIds: string | null;
	type: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export interface ResellerDashboardCustomer {
	customerId: string;
	customerName: string;
	totalSeatsRange: SeatRangeValue;
	totalArr: number;
	subscriptionCount: number;
	subscriptionSkuNames: string[];
	renewalDate: string | null;
	closestRenewalLabel: string;
	copilotMAUPercentage: number | null;
}

export interface ResellerCustomerSummary {
	totalCustomers: number;
	totalSubscriptions: number;
	totalSeats: number;
	totalArr: number;
}

export interface ResellerCustomersFilters {
	customerName?: string[];
	currentSku?: string[];
	region?: string[];
	seats?: string[];
	currentArr?: string[];
	renewalDate?: string[];
	copilotFit?: string[];
	copilotIntent?: string[];
	copilotCluster?: string[];
	hasCompete?: string[];
	hasTransactedProduct?: string[];
	distributorName?: string[];
	customerTpid?: string[];
	copilotChatToPaid?: string[];
	mwPaidSeatRange?: string[];
}

export interface ResellerCustomersResponse {
	page: number;
	pageSize: number;
	total: number;
	sortBy: string;
	sortDir: 'ascending' | 'descending';
	rows: ResellerDashboardCustomer[];
	summary?: ResellerCustomerSummary;
	availableOptions?: Record<string, string[]>;
}

interface CreateResellerCustomerInput {
	customerName: string;
	customerTpid?: string;
	countryName: string;
	renewalDate?: string;
	renewalMonth?: string;
	subscriptionName?: string;
	licenseCount?: number;
}

export interface UseResellerCustomersReturn {
	customers: ResellerDashboardCustomer[];
	total: number;
	summary: ResellerCustomerSummary | null;
	availableOptions: Record<string, string[]>;
	loading: boolean;
	error: string | null;
	page: number;
	pageSize: number;
	setPage: (page: number) => void;
	sortBy: string;
	sortDir: 'ascending' | 'descending';
	setSort: (sortBy: string, sortDir: 'ascending' | 'descending') => void;
	addCustomer: (data: CreateResellerCustomerInput) => Promise<ResellerSubscription>;
	removeCustomer: (id: string) => Promise<void>;
	refresh: (filters?: ResellerCustomersFilters) => Promise<void>;
}

const DEFAULT_PAGE_SIZE = 20;

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

export function useResellerCustomers(
	filters?: ResellerCustomersFilters,
): UseResellerCustomersReturn {
	const { isAuthenticated } = useResellerAuth();
	const [customers, setCustomers] = useState<ResellerDashboardCustomer[]>([]);
	const [total, setTotal] = useState(0);
	const [summary, setSummary] = useState<ResellerCustomerSummary | null>(null);
	const [availableOptions, setAvailableOptions] = useState<
		Record<string, string[]>
	>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshCounter, setRefreshCounter] = useState(0);

	const [tableState, setTableState] = useQueryStates(resellerTableParsers, {
		urlKeys: resellerTableUrlKeys,
		history: 'replace',
	});
	const page = tableState.page;
	const sortBy = tableState.sortBy;
	const sortDir = tableState.sortDir as 'ascending' | 'descending';

	// Reset page to 1 when filters change
	const filtersKey = filters
		? JSON.stringify(filters)
		: '';
	useEffect(() => {
		void setTableState({ page: 1 });
	}, [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps

	const setPage = useCallback((p: number) => {
		void setTableState({ page: p });
	}, [setTableState]);

	// ── Auto-fetch effect with AbortController ──────────────────────
	useEffect(() => {
		if (!isAuthenticated) return;

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
				appendQueryArray(
					params,
					'hasTransactedProduct',
					filters?.hasTransactedProduct,
				);
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

				const response = await resellerApiFetch(
					`/api/reseller/customers?${params.toString()}`,
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
				setError(err instanceof Error ? err.message : 'Failed to load customers');
			} finally {
				if (!abortController.signal.aborted) {
					setLoading(false);
				}
			}
		};

		void run();
		return () => abortController.abort();
	}, [isAuthenticated, page, filtersKey, sortBy, sortDir, refreshCounter]);

	// Manual refresh (used after add/bulk-add/delete)
	const triggerRefresh = useCallback(() => {
		setRefreshCounter((c) => c + 1);
	}, []);

	const fetchCustomers = useCallback(
		async (overrideFilters?: ResellerCustomersFilters) => {
			if (!isAuthenticated) return;
			if (overrideFilters) {
				// For manual refresh with override filters, do a one-off fetch
				setLoading(true);
				setError(null);
				try {
					const params = new URLSearchParams();
					params.set('page', String(page));
					params.set('pageSize', String(DEFAULT_PAGE_SIZE));
					params.set('includeParts', 'summary,options');
					params.set('sortBy', mapSortColumn(sortBy));
					params.set('sortDir', sortDir);

					appendQueryArray(params, 'customerName', overrideFilters.customerName);
					appendQueryArray(params, 'currentSku', overrideFilters.currentSku);
					appendQueryArray(params, 'region', overrideFilters.region);
					appendQueryArray(params, 'seats', overrideFilters.seats);
					appendQueryArray(params, 'currentArr', overrideFilters.currentArr);
					appendQueryArray(params, 'renewalDate', overrideFilters.renewalDate);
					appendQueryArray(params, 'copilotFit', overrideFilters.copilotFit);
					appendQueryArray(params, 'copilotIntent', overrideFilters.copilotIntent);
					appendQueryArray(params, 'copilotCluster', overrideFilters.copilotCluster);
					appendQueryArray(params, 'hasCompete', overrideFilters.hasCompete);
					appendQueryArray(
						params,
						'hasTransactedProduct',
						overrideFilters.hasTransactedProduct,
					);
					appendQueryArray(params, 'distributorName', overrideFilters.distributorName);
					appendQueryArray(params, 'customerTpid', overrideFilters.customerTpid);
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

					const response = await resellerApiFetch(
						`/api/reseller/customers?${params.toString()}`,
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
					setError(err instanceof Error ? err.message : 'Failed to load customers');
				} finally {
					setLoading(false);
				}
			} else {
				triggerRefresh();
			}
		},
		[isAuthenticated, page, sortBy, sortDir, triggerRefresh],
	);

	const addCustomer = useCallback(
		async (data: CreateResellerCustomerInput): Promise<ResellerSubscription> => {
			if (!isAuthenticated) throw new Error('Not authenticated');

			const response = await resellerApiFetch('/api/reseller/customers', {
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
		[isAuthenticated, fetchCustomers],
	);

	const setSort = useCallback(
		(nextSortBy: string, nextSortDir: 'ascending' | 'descending') => {
			void setTableState({ sortBy: nextSortBy, sortDir: nextSortDir, page: 1 });
		},
		[setTableState],
	);

	const removeCustomer = useCallback(
		async (id: string): Promise<void> => {
			if (!isAuthenticated) throw new Error('Not authenticated');

			const response = await resellerApiFetch(
				`/api/reseller/customers/${id}`,
				{ method: 'DELETE' },
			);

			if (!response.ok) {
				throw new Error(`Failed to delete customer: ${response.status}`);
			}

			await fetchCustomers();
		},
		[isAuthenticated, fetchCustomers],
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
