import { getServerApiBaseUrl } from '@/lib/api-base-url';

interface BootstrapResellerInput {
	apiAccessToken: string;
	provider: 'entra' | 'google';
	providerSubject: string;
	email: string;
	displayName?: string | null;
	issuer?: string | null;
	tenantId?: string | null;
	mpnId?: string | null;
}

export interface BootstrappedResellerSession {
	user: {
		userType: 'reseller';
		userId: string;
		orgId: string;
		email: string;
		displayName: string | null;
	};
	accessToken: string;
	accessTokenExpiresAt: number;
}

export async function bootstrapResellerUser(
	input: BootstrapResellerInput,
): Promise<BootstrappedResellerSession> {
	const response = await fetch(
		`${getServerApiBaseUrl()}/api/reseller/auth/bootstrap`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${input.apiAccessToken}`,
			},
			body: JSON.stringify({
				provider: input.provider,
				providerSubject: input.providerSubject,
				email: input.email,
				displayName: input.displayName ?? null,
				issuer: input.issuer ?? null,
				tenantId: input.tenantId ?? null,
				mpnId: input.mpnId ?? null,
			}),
			cache: 'no-store',
		},
	);

	if (!response.ok) {
		const reason = await response.text();
		throw new Error(
			`Reseller bootstrap failed: ${response.status} ${reason || response.statusText}`,
		);
	}

	return (await response.json()) as BootstrappedResellerSession;
}
