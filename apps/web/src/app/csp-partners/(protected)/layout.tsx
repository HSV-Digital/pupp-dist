import { redirect } from 'next/navigation';
import { auth as resellerAuth } from '@/lib/reseller-auth';
import { ResellerAuthProvider } from '@/lib/reseller-auth-context';
import ResellerShell from './ResellerShell';
import { PlausibleProvider } from '../../PlausibleProvider';
import { PlausibleIdentifyReseller } from '../../PlausibleIdentifyReseller';

const HSV_EMAIL_DOMAIN = '@hsv.digital';

export default async function ProtectedResellerLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await resellerAuth();

	if (
		session?.userType !== 'reseller' ||
		!session.resellerUserId ||
		!session.orgId
	) {
		redirect('/csp-partners');
	}

	const isHsvUser =
		session.user?.email?.toLowerCase().endsWith(HSV_EMAIL_DOMAIN) ?? false;

	return (
		<>
			{isHsvUser && (
				<script
					dangerouslySetInnerHTML={{
						__html: `try{localStorage.setItem('plausible_ignore','true')}catch(e){}`,
					}}
				/>
			)}
			<PlausibleProvider>
				<ResellerAuthProvider>
					<PlausibleIdentifyReseller />
					<ResellerShell>{children}</ResellerShell>
				</ResellerAuthProvider>
			</PlausibleProvider>
		</>
	);
}
