'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ResellerFormData } from './reseller-session';
import {
	type SessionResellerEntry,
	readResellerDashboardEntries,
	addResellerDashboardEntry,
	removeResellerDashboardEntry,
} from './reseller-dashboard-session';

export interface UseSessionResellersReturn {
	resellers: SessionResellerEntry[];
	loading: boolean;
	addReseller: (data: ResellerFormData) => SessionResellerEntry;
	removeReseller: (id: string) => void;
}

export function useSessionResellers(): UseSessionResellersReturn {
	const [resellers, setResellers] = useState<SessionResellerEntry[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		setResellers(readResellerDashboardEntries());
		setLoading(false);
	}, []);

	const addReseller = useCallback((data: ResellerFormData) => {
		const entry = addResellerDashboardEntry(data);
		setResellers(readResellerDashboardEntries());
		return entry;
	}, []);

	const removeReseller = useCallback((id: string) => {
		removeResellerDashboardEntry(id);
		setResellers(readResellerDashboardEntries());
	}, []);

	return { resellers, loading, addReseller, removeReseller };
}
