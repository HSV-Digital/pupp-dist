import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth as resellerAuth } from '@/lib/reseller-auth';
import ResellersHero from './ResellersHero';

export default async function ResellersPage() {
	const session = await resellerAuth();

	if (
		session?.userType === 'reseller' &&
		session.resellerUserId &&
		session.orgId
	) {
		redirect('/csp-partners/dashboard');
	}

	return (
		<Suspense>
			<ResellersHero />
		</Suspense>
	);
}
