interface AuthIdentityClaims {
	email?: string;
	preferredUsername?: string;
	sub: string;
}

export interface ResolvedAuthIdentity {
	compatibilityEmail: string;
	canonicalEmail: string | null;
	claimEmail: string | null;
	preferredUsername: string | null;
	subjectId: string;
}

function normalizeEmailLikeValue(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim();
	if (!trimmed) {
		return null;
	}

	return trimmed.toLowerCase();
}

function normalizeSubjectId(value: string): string {
	return value.trim();
}

export function resolveAuthenticatedIdentity(
	claims: AuthIdentityClaims,
	options?: {
		databaseEmail?: string | null;
	},
): ResolvedAuthIdentity {
	const subjectId = normalizeSubjectId(claims.sub);
	const claimEmail = normalizeEmailLikeValue(claims.email);
	const preferredUsername = normalizeEmailLikeValue(claims.preferredUsername);
	const databaseEmail = normalizeEmailLikeValue(options?.databaseEmail);
	const canonicalEmail =
		databaseEmail ?? claimEmail ?? preferredUsername ?? null;

	return {
		compatibilityEmail: canonicalEmail ?? subjectId,
		canonicalEmail,
		claimEmail,
		preferredUsername,
		subjectId,
	};
}
