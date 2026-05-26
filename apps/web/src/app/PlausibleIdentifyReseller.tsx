'use client';

import { useEffect } from 'react';
import { useResellerAuth } from '@/lib/reseller-auth-context';

const HSV_EMAIL_DOMAIN = '@hsv.digital';

export function PlausibleIdentifyReseller() {
	const { email, isAuthenticated, hydrated } = useResellerAuth();

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (!hydrated) return;
		if (!isAuthenticated || !email) return;
		if (!email.toLowerCase().endsWith(HSV_EMAIL_DOMAIN)) return;

		try {
			if (window.localStorage.getItem('plausible_ignore') === 'true') return;
			window.localStorage.setItem('plausible_ignore', 'true');
		} catch {
			// localStorage may be unavailable (private mode, quota, etc.) — ignore.
		}
	}, [email, isAuthenticated, hydrated]);

	return null;
}
