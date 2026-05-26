'use client';

import ResellerNavbar from '@/components/resellers/ResellerNavbar';
import { useResellerAuth } from '@/lib/reseller-auth-context';

export default function ResellerShell({
	children,
}: {
	children: React.ReactNode;
}) {
	const { user, email, logout } = useResellerAuth();

	return (
		<div className="flex-1 flex flex-col w-full">
			<ResellerNavbar name={user?.name} email={email} handleLogout={logout} />
			{children}
		</div>
	);
}
