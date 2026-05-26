'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
	AuditActionStatus,
	AuditEventListResponse,
	AuditEventRecord,
} from '@repo/types';
import { apiFetch } from '@/lib/api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';

export interface AuditFilterState {
	from: string;
	to: string;
	eventName: string;
	actionStatus: AuditActionStatus | '';
	actorId: string;
	targetType: string;
	targetId: string;
	requestId: string;
	search: string;
}

const DEFAULT_FILTERS: AuditFilterState = {
	from: '',
	to: '',
	eventName: '',
	actionStatus: '',
	actorId: '',
	targetType: '',
	targetId: '',
	requestId: '',
	search: '',
};

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_ERROR_MESSAGE = 'Failed to load audit events.';

function buildQuery(params: {
	page: number;
	pageSize: number;
	filters: AuditFilterState;
}): string {
	const query = new URLSearchParams({
		page: `${params.page}`,
		pageSize: `${params.pageSize}`,
	});

	if (params.filters.from.trim()) {
		query.set('from', params.filters.from.trim());
	}

	if (params.filters.to.trim()) {
		query.set('to', params.filters.to.trim());
	}

	if (params.filters.eventName.trim()) {
		const values = params.filters.eventName
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);

		for (const value of values) {
			query.append('eventName', value);
		}
	}

	if (params.filters.actionStatus) {
		query.set('actionStatus', params.filters.actionStatus);
	}

	if (params.filters.actorId.trim()) {
		query.set('actorId', params.filters.actorId.trim());
	}

	if (params.filters.targetType.trim()) {
		query.set('targetType', params.filters.targetType.trim());
	}

	if (params.filters.targetId.trim()) {
		query.set('targetId', params.filters.targetId.trim());
	}

	if (params.filters.requestId.trim()) {
		query.set('requestId', params.filters.requestId.trim());
	}

	if (params.filters.search.trim()) {
		query.set('search', params.filters.search.trim());
	}

	return query.toString();
}

export function useAuditApi() {
	const [filters, setFilters] = useState<AuditFilterState>(DEFAULT_FILTERS);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
	const [rows, setRows] = useState<AuditEventRecord[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);

	const refresh = useCallback(() => {
		setRefreshToken((value) => value + 1);
	}, []);

	const queryString = useMemo(
		() =>
			buildQuery({
				page,
				pageSize,
				filters,
			}),
		[filters, page, pageSize],
	);

	useEffect(() => {
		const controller = new AbortController();

		const run = async () => {
			setLoading(true);
			setError(null);

			try {
				const response = await apiFetch(`/api/audit/events?${queryString}`, {
					method: 'GET',
					cache: 'no-store',
					signal: controller.signal,
				});

				const payload = await parseJsonSafely(response);
				if (!response.ok) {
					throw new Error(parseApiErrorMessage(payload, DEFAULT_ERROR_MESSAGE));
				}

				const parsed = payload as AuditEventListResponse;
				if (!parsed || !Array.isArray(parsed.rows)) {
					throw new Error(DEFAULT_ERROR_MESSAGE);
				}

				setRows(parsed.rows);
				setTotal(parsed.total);
			} catch (fetchError) {
				if (controller.signal.aborted) {
					return;
				}

				setRows([]);
				setTotal(0);
				setError(
					fetchError instanceof Error
						? fetchError.message
						: DEFAULT_ERROR_MESSAGE,
				);
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		};

		void run();

		return () => {
			controller.abort();
		};
	}, [queryString, refreshToken]);

	const updateFilters = useCallback((next: Partial<AuditFilterState>) => {
		setFilters((previous) => ({
			...previous,
			...next,
		}));
		setPage(1);
	}, []);

	const clearFilters = useCallback(() => {
		setFilters(DEFAULT_FILTERS);
		setPage(1);
	}, []);

	return {
		filters,
		updateFilters,
		clearFilters,
		page,
		setPage,
		pageSize,
		setPageSize,
		rows,
		total,
		loading,
		error,
		refresh,
	};
}
