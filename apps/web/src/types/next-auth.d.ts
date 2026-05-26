import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
	interface Session {
		userType?: 'internal' | 'reseller';
		accessToken?: string;
		entraObjectId?: string;
		tenantId?: string;
		orgId?: string;
		resellerUserId?: string;
		externalTenantId?: string;
		mpnId?: string;
		partnerName?: string;
		roles: string[];
	}
}

declare module 'next-auth/jwt' {
	interface JWT {
		partnerCenterToken?: string;
		mpnId?: string;
		partnerName?: string;
		userType?: 'internal' | 'reseller';
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number;
		entraObjectId?: string;
		tenantId?: string;
		orgId?: string;
		resellerUserId?: string;
		providerSubject?: string;
		issuer?: string;
		externalTenantId?: string;
		displayName?: string | null;
		roles?: string[];
		appEmail?: string;
		error?: string;
	}
}
