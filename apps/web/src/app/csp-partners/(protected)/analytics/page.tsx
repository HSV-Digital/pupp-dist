import { redirect } from 'next/navigation';
import { auth as resellerAuth } from '@/lib/reseller-auth';
import { isHsvEmail } from '@/lib/hsv-email';
import { CspPartnerAnalyticsClient } from '@/components/csp-partner-analytics/csp-partner-analytics-client';

export default async function CspPartnerAnalyticsPage() {
	const session = await resellerAuth();

	if (!isHsvEmail(session?.user?.email)) {
		redirect('/csp-partners/dashboard');
	}

	return <CspPartnerAnalyticsClient />;
}
