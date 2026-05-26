'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useDemoResellerCustomerSubscriptions } from '@/lib/use-demo-reseller-customer-subscriptions';
import { synthesizeSubscriptionsFromCustomers } from '@/lib/synthesize-subscription';
import {
	decodeResellerCustomerRouteKey,
	encodeResellerCustomerRouteKey,
} from '@/lib/reseller-customer-route';
import { ProposalPageContent } from '@/components/proposal/ProposalPageContent';
import { writeDemoCustomerSnapshot } from '@/lib/demo-data-utils';

function DemoResellerProposalPageContent() {
	const params = useParams<{ customerId: string }>();
	const router = useRouter();
	const searchParams = useSearchParams();
	const routeCustomerId = params.customerId;
	const customerId = decodeResellerCustomerRouteKey(routeCustomerId);
	const {
		subscriptions: customerRows,
		loading,
		error,
	} = useDemoResellerCustomerSubscriptions(customerId);

	useEffect(() => {
		if (error) {
			router.replace('/csp-partners/demo');
		}
	}, [error, router]);

	const from = searchParams.get('from');
	const backHref =
		from === 'resellers-dashboard'
			? '/csp-partners/demo'
			: '/csp-partners/demo';

	const subscriptions = useMemo(
		() => synthesizeSubscriptionsFromCustomers(customerId, customerRows),
		[customerRows, customerId],
	);

	const customerName = customerRows[0]?.customerName ?? '';

	useEffect(() => {
		if (customerRows.length === 0) return;
		writeDemoCustomerSnapshot({
			customerId,
			customerName,
			subscriptions,
		});
	}, [customerId, customerName, customerRows.length, subscriptions]);

	return (
		<ProposalPageContent
			customerId={customerId}
			customerName={customerName}
			subscriptions={subscriptions}
			backHref={backHref}
			assetsBasePath={`/csp-partners/demo/proposal/${encodeResellerCustomerRouteKey(customerId)}/assets`}
			isReseller
			showTpid={false}
			showPartnerActions
			usePublicEmailApi
			loading={loading}
			showCurrencySwitcher
			resetCurrencyToRegionOnMount
		/>
	);
}

export default function DemoResellerProposalPage() {
	return (
		<Suspense fallback={null}>
			<DemoResellerProposalPageContent />
		</Suspense>
	);
}
