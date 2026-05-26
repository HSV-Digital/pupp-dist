'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { usePathname } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { env } from '@/env';

let postHogInitialized = false;

function isProtectedAnalyticsPath(pathname: string): boolean {
	return (
		pathname.startsWith('/dashboard') ||
		pathname.startsWith('/proposal') ||
		pathname.startsWith('/admin') ||
		pathname.startsWith('/reseller/') ||
		pathname.startsWith('/csp-partners/')
	);
}

function shouldMaskInputValue(element: Element | null | undefined): boolean {
	return (
		element instanceof HTMLInputElement ||
		element instanceof HTMLTextAreaElement ||
		element instanceof HTMLSelectElement ||
		element?.getAttribute('contenteditable') === 'true'
	);
}

function resolveTracingHosts(): string[] {
	const baseUrl = env.NEXT_PUBLIC_API_BASE_URL;
	if (!baseUrl) {
		return [];
	}

	try {
		return [new URL(baseUrl).host];
	} catch {
		return [];
	}
}

if (typeof window !== 'undefined') {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
		console.warn(
			'[PostHog] NEXT_PUBLIC_POSTHOG_KEY is not set. Analytics will be disabled.',
		);
	} else {
		try {
			const tracingHosts = resolveTracingHosts();
			posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
				api_host: env.NEXT_PUBLIC_POSTHOG_HOST,
				cookieless_mode: 'always',
				capture_pageview: false,
				capture_pageleave: true,
				__add_tracing_headers:
					tracingHosts.length > 0 ? tracingHosts : undefined,
			});
			postHogInitialized = true;
		} catch (error) {
			console.error('[PostHog] Failed to initialize analytics:', error);
		}
	}
}

function PostHogPageView() {
	const pathname = usePathname();

	useEffect(() => {
		if (!pathname || !postHogInitialized) return;

		try {
			if (isProtectedAnalyticsPath(pathname)) {
				posthog.stopSessionRecording();
			} else if (!posthog.sessionRecordingStarted()) {
				posthog.startSessionRecording();
			}

			posthog.capture('$pageview', {
				$current_url: window.origin + pathname,
			});
		} catch (error) {
			console.error('[PostHog] Failed to capture pageview:', error);
		}
	}, [pathname]);

	return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
	if (!postHogInitialized) {
		return <>{children}</>;
	}

	return (
		<PHProvider client={posthog}>
			<Suspense fallback={null}>
				<PostHogPageView />
			</Suspense>
			{children}
		</PHProvider>
	);
}
