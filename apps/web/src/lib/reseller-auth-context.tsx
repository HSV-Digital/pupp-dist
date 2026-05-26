'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SessionProvider, signOut, useSession } from 'next-auth/react';

interface ResellerAuthContextValue {
	user: {
		name?: string | null;
		email?: string | null;
		image?: string | null;
	} | null;
	email: string | null;
	orgId: string | null;
	resellerUserId: string | null;
	externalTenantId: string | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	hydrated: boolean;
	logout: () => Promise<void>;
	refreshSession: () => Promise<void>;
}

const ResellerAuthContext = createContext<ResellerAuthContextValue>({
	user: null,
	email: null,
	orgId: null,
	resellerUserId: null,
	externalTenantId: null,
	isAuthenticated: false,
	isLoading: true,
	hydrated: false,
	logout: async () => {},
	refreshSession: async () => {},
});

function ResellerAuthContextInner({ children }: { children: React.ReactNode }) {
	const { data: session, status, update } = useSession();
	const [state, setState] = useState({
		verified: false,
		profile: null,
		loading: true,
	  });
	useEffect(() => {
		fetch("/csp-partners/api/reseller/verify-partner")
      .then((res) => res.json())
      .then((data) => {
        setState({
          verified: data.verified,
          profile: data.verified ? data.profile : null,
          loading: false,
        });
      })
      .catch(() => {
        setState({ verified: false, profile: null, loading: false });
      });
	}, [])

	const logout = useCallback(async () => {
		await signOut({ callbackUrl: '/csp-partners' });
	}, []);

	const refreshSession = useCallback(async () => {
		await update();
	}, [update]);

	const contextValue = useMemo<ResellerAuthContextValue>(
		() => ({
			user: session?.user ?? null,
			email: session?.user?.email ?? null,
			orgId: session?.orgId ?? null,
			resellerUserId: session?.resellerUserId ?? null,
			externalTenantId: session?.externalTenantId ?? null,
			isAuthenticated:
				status === 'authenticated' && session?.userType === 'reseller',
			isLoading: status === 'loading',
			hydrated: status !== 'loading',
			logout,
			refreshSession,
		}),
		[logout, refreshSession, session, status],
	);

	return (
		<ResellerAuthContext.Provider value={contextValue}>
			{children}
		</ResellerAuthContext.Provider>
	);
}

export function ResellerAuthProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<SessionProvider basePath="/api/reseller/auth">
			<ResellerAuthContextInner>{children}</ResellerAuthContextInner>
		</SessionProvider>
	);
}

export function useResellerAuth() {
	return useContext(ResellerAuthContext);
}
