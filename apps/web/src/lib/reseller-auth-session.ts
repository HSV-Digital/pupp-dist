const RESELLER_AUTH_KEY = 'reseller-auth';

export interface ResellerAuthData {
	accessToken: string;
	accessTokenExpiresAt: number;
	user: {
		userId: string;
		orgId: string;
		email: string;
		displayName: string | null;
	};
}

export function writeResellerAuth(data: ResellerAuthData): void {
	try {
		localStorage.setItem(RESELLER_AUTH_KEY, JSON.stringify(data));
	} catch {
		// localStorage may be unavailable (SSR, private browsing quota)
	}
}

export function readResellerAuth(): ResellerAuthData | null {
	try {
		const raw = localStorage.getItem(RESELLER_AUTH_KEY);
		if (!raw) return null;

		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;

		const obj = parsed as Record<string, unknown>;
		if (
			typeof obj.accessToken !== 'string' ||
			typeof obj.accessTokenExpiresAt !== 'number' ||
			!obj.user ||
			typeof obj.user !== 'object'
		) {
			return null;
		}

		const user = obj.user as Record<string, unknown>;
		if (
			typeof user.userId !== 'string' ||
			typeof user.orgId !== 'string' ||
			typeof user.email !== 'string'
		) {
			return null;
		}

		// Check if token is expired
		const nowSeconds = Math.floor(Date.now() / 1000);
		if (obj.accessTokenExpiresAt <= nowSeconds) {
			localStorage.removeItem(RESELLER_AUTH_KEY);
			return null;
		}

		return obj as unknown as ResellerAuthData;
	} catch {
		return null;
	}
}

export function clearResellerAuth(): void {
	try {
		localStorage.removeItem(RESELLER_AUTH_KEY);
	} catch {
		// localStorage may be unavailable
	}
}

export function isResellerLoggedIn(): boolean {
	return readResellerAuth() !== null;
}
