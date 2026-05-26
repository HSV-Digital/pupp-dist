export interface ResellerBootstrapUser {
	provider: 'entra' | 'google' | 'email';
	providerSubject: string;
	email: string;
	displayName: string | null;
	issuer: string | null;
	externalTenantId: string | null;
	mpnId?: string | null;
}
