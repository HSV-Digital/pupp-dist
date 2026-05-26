export type AuthenticatedUserType = 'internal' | 'reseller';

interface BaseAuthenticatedPrincipal {
	userType: AuthenticatedUserType;
	userId: string | null;
	email: string;
	canonicalEmail: string | null;
	tenantId: string;
	orgId: string | null;
	name?: string;
}

export interface InternalAuthUser extends BaseAuthenticatedPrincipal {
	userType: 'internal';
	orgId: null;
	entraObjectId: string;
	claimEmail: string | null;
	preferredUsername: string | null;
	subjectId: string;
	roles: string[];
}

export interface ResellerAuthUser extends BaseAuthenticatedPrincipal {
	userType: 'reseller';
	userId: string;
	orgId: string;
	provider: string;
	providerSubject: string;
	issuer: string | null;
	externalTenantId: string | null;
	displayName: string | null;
	mpnId: string | null;
}

export type AuthenticatedPrincipal = InternalAuthUser | ResellerAuthUser;

export type AuthUser = Omit<InternalAuthUser, 'userType' | 'orgId'> & {
	userType?: 'internal';
	orgId?: null;
};
