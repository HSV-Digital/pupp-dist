'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { AssetsPageContent } from '@/components/proposal/AssetsPageContent';
import { readDemoCustomerSnapshot } from '@/lib/demo-data-utils';
import {
	decodeResellerCustomerRouteKey,
	encodeResellerCustomerRouteKey,
} from '@/lib/reseller-customer-route';

function DemoResellerAssetsPageContent() {
	const params = useParams<{ customerId: string }>();
	const routeCustomerId = params.customerId;
	const customerId = decodeResellerCustomerRouteKey(routeCustomerId);
	const snapshot = readDemoCustomerSnapshot();

	if (!snapshot || snapshot.customerId !== customerId) {
		return (
			<div className="flex items-center justify-center min-h-[400px] text-neutral-500">
				Customer data not found. Please go back and try again.
			</div>
		);
	}

	const proposalBasePath = `/csp-partners/demo/proposal/${encodeResellerCustomerRouteKey(customerId)}`;

	return (
		<AssetsPageContent
			customerId={customerId}
			backHref={proposalBasePath}
			proposalBasePath={proposalBasePath}
			showPartnerEmail={false}
			isNewCustomer
			loadRequest={{
				kind: 'public',
				customerSnapshot: {
					customerId: snapshot.customerId,
					customerName: snapshot.customerName,
					subscriptions: snapshot.subscriptions,
				},
			}}
			showCspPartnerResources
		/>
	);
}

export default function DemoResellerAssetsPage() {
	return (
		<Suspense fallback={null}>
			<DemoResellerAssetsPageContent />
		</Suspense>
	);
}
