export interface ResellerApiTokenPayload {
	v: 1;
	userType: 'reseller';
	sub: string;
	orgId: string;
	email: string;
	displayName: string | null;
	provider: 'entra' | 'google' | 'email';
	providerSubject: string;
	issuer: string | null;
	externalTenantId: string | null;
	mpnId: string | null;
	iat: number;
	exp: number;
	jti: string;
}

export interface CreateResellerApiTokenInput {
	userId: string;
	orgId: string;
	email: string;
	displayName?: string | null;
	provider?: 'entra' | 'google' | 'email';
	providerSubject: string;
	issuer?: string | null;
	externalTenantId?: string | null;
	mpnId?: string | null;
	ttlSeconds?: number;
}
