import { describe, expect, it } from 'vitest';
import { resolveAuthenticatedIdentity } from './auth-user-identity';

describe('resolveAuthenticatedIdentity', () => {
	it('prefers the canonical database email when present', () => {
		expect(
			resolveAuthenticatedIdentity(
				{
					email: 'claim@example.com',
					preferredUsername: 'preferred@example.com',
					sub: 'opaque-subject',
				},
				{ databaseEmail: 'Canonical@Example.com' },
			),
		).toEqual({
			compatibilityEmail: 'canonical@example.com',
			canonicalEmail: 'canonical@example.com',
			claimEmail: 'claim@example.com',
			preferredUsername: 'preferred@example.com',
			subjectId: 'opaque-subject',
		});
	});

	it('falls back to token email and preferred username before using subject only for compatibility', () => {
		expect(
			resolveAuthenticatedIdentity(
				{
					email: 'Claim@Example.com',
					preferredUsername: 'preferred@example.com',
					sub: 'opaque-subject',
				},
				{ databaseEmail: null },
			),
		).toEqual({
			compatibilityEmail: 'claim@example.com',
			canonicalEmail: 'claim@example.com',
			claimEmail: 'claim@example.com',
			preferredUsername: 'preferred@example.com',
			subjectId: 'opaque-subject',
		});

		expect(
			resolveAuthenticatedIdentity(
				{
					preferredUsername: 'Preferred@Example.com',
					sub: 'opaque-subject',
				},
				{ databaseEmail: null },
			),
		).toEqual({
			compatibilityEmail: 'preferred@example.com',
			canonicalEmail: 'preferred@example.com',
			claimEmail: null,
			preferredUsername: 'preferred@example.com',
			subjectId: 'opaque-subject',
		});
	});

	it('never treats the subject claim as a canonical email', () => {
		expect(
			resolveAuthenticatedIdentity(
				{
					sub: 'opaque-subject',
				},
				{ databaseEmail: null },
			),
		).toEqual({
			compatibilityEmail: 'opaque-subject',
			canonicalEmail: null,
			claimEmail: null,
			preferredUsername: null,
			subjectId: 'opaque-subject',
		});
	});
});
