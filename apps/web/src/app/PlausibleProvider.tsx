'use client';

import { useEffect } from 'react';
import { env } from '@/env';

let plausibleInitialized = false;

export function PlausibleProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		if (plausibleInitialized) return;

		const domain = env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
		if (!domain) {
			console.warn(
				'[Plausible] NEXT_PUBLIC_PLAUSIBLE_DOMAIN is not set. Analytics will be disabled.',
			);
			return;
		}

		plausibleInitialized = true;

		import('@plausible-analytics/tracker')
			.then(({ init }) => {
				init({
					domain,
					endpoint: env.NEXT_PUBLIC_PLAUSIBLE_API_HOST
						? `${env.NEXT_PUBLIC_PLAUSIBLE_API_HOST.replace(/\/+$/, '')}/api/event`
						: undefined,
					autoCapturePageviews: true,
					captureOnLocalhost: true,
					outboundLinks: true,
					fileDownloads: true,
				});
			})
			.catch((error) => {
				plausibleInitialized = false;
				console.error('[Plausible] Failed to initialize analytics:', error);
			});
	}, []);

	return <>{children}</>;
}
