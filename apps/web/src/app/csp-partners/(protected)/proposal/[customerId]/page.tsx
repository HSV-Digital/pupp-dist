'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useResellerCustomerSubscriptions } from '@/lib/use-reseller-customer-subscriptions';
import { synthesizeSubscriptionsFromCustomers } from '@/lib/synthesize-subscription';
import {
	decodeResellerCustomerRouteKey,
	encodeResellerCustomerRouteKey,
} from '@/lib/reseller-customer-route';
import { ProposalPageContent } from '@/components/proposal/ProposalPageContent';
import { recordCspPartnerViewProposalEvent } from '@/components/csp-partner-analytics/csp-partner-analytics-api';

function ResellerProposalPageContent() {
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

	const viewRecordedRef = useRef(false);
	useEffect(() => {
		if (loading || error || customerRows.length === 0) return;
		if (viewRecordedRef.current) return;
		viewRecordedRef.current = true;
		void recordCspPartnerViewProposalEvent(customerId);
	}, [loading, error, customerRows.length, customerId]);

	const from = searchParams.get('from');
	const backHref =
		from === 'resellers-dashboard'
			? '/csp-partners/dashboard'
			: from === 'dashboard'
				? '/dashboard'
				: '/csp-partners/dashboard';

	const subscriptions = useMemo(
		() => synthesizeSubscriptionsFromCustomers(customerId, customerRows),
		[customerRows, customerId],
	);

	const customerName = customerRows[0]?.customerName ?? '';

	return (
		<ProposalPageContent
			customerId={customerId}
			customerName={customerName}
			subscriptions={subscriptions}
			backHref={backHref}
			assetsBasePath={`/csp-partners/proposal/${encodeResellerCustomerRouteKey(customerId)}/assets`}
			isReseller
			showTpid={false}
			showCurrencySwitcher={true}
			resetCurrencyToRegionOnMount
			showPartnerActions={from === 'dashboard'}
			loading={loading}
		/>
	);
}

export default function ResellerProposalPage() {
	return (
		<Suspense fallback={null}>
			<ResellerProposalPageContent />
		</Suspense>
	);
}
