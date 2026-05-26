'use client';

import { Suspense, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useResellerCustomerSubscriptions } from '@/lib/use-reseller-customer-subscriptions';
import {
	decodeResellerCustomerRouteKey,
	encodeResellerCustomerRouteKey,
} from '@/lib/reseller-customer-route';
import { AssetsPageContent } from '@/components/proposal/AssetsPageContent';

function ResellerAssetsPageContent() {
	const params = useParams<{ customerId: string }>();
	const router = useRouter();
	const searchParams = useSearchParams();
	const routeCustomerId = params.customerId;
	const customerId = decodeResellerCustomerRouteKey(routeCustomerId);
	const {
		subscriptions: customerRows,
		loading,
		error,
	} = useResellerCustomerSubscriptions(customerId);

	useEffect(() => {
		if (error) {
			router.replace('/csp-partners/dashboard');
		}
	}, [error, router]);

	const from = searchParams.get('from');
	const proposalBasePath = `/csp-partners/proposal/${encodeResellerCustomerRouteKey(customerId)}`;
	const backHref =
		from === 'dashboard'
			? `${proposalBasePath}?from=dashboard`
			: proposalBasePath;

	return (
		<AssetsPageContent
			customerId={customerId}
			backHref={backHref}
			showPartnerEmail={from === 'dashboard'}
			isNewCustomer
			proposalBasePath={backHref}
			loadRequest={
				customerRows.length > 0
					? {
							kind: 'reseller',
						}
					: null
			}
			loading={loading}
			showCspPartnerResources
		/>
	);
}

export default function ResellerAssetsPage() {
	return (
		<Suspense fallback={null}>
			<ResellerAssetsPageContent />
		</Suspense>
	);
}
