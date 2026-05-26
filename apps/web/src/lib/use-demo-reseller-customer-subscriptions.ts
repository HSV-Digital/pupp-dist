'use client';

import { useEffect, useState } from 'react';
import { demoResellerApiFetch } from './demo-reseller-api-client';
import type { ResellerSubscription } from './use-reseller-customers';

interface UseDemoResellerCustomerSubscriptionsResult {
	subscriptions: ResellerSubscription[];
	loading: boolean;
	error: string | null;
}

export function useDemoResellerCustomerSubscriptions(
	customerId: string,
): UseDemoResellerCustomerSubscriptionsResult {
	const [subscriptions, setSubscriptions] = useState<ResellerSubscription[]>(
		[],
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const abortController = new AbortController();

		async function fetchSubscriptions() {
			setLoading(true);
			setError(null);

			try {
				const response = await demoResellerApiFetch(
					`/customers/subscriptions?customerName=${encodeURIComponent(customerId)}`,
					{ signal: abortController.signal },
				);

				if (!response.ok) {
					throw new Error(
						`Failed to load reseller customer data (${response.status})`,
					);
				}

				const payload = (await response.json()) as unknown;
				if (!Array.isArray(payload)) {
					throw new Error('Invalid reseller customer subscription response');
				}

				setSubscriptions(payload as ResellerSubscription[]);
				setLoading(false);
			} catch (err) {
				if (abortController.signal.aborted) {
					return;
				}

				setSubscriptions([]);
				setError(
					err instanceof Error
						? err.message
						: 'Unable to load reseller customer data',
				);
				setLoading(false);
			}
		}

		void fetchSubscriptions();

		return () => {
			abortController.abort();
		};
	}, [customerId]);

	return {
		subscriptions,
		loading,
		error,
	};
}
