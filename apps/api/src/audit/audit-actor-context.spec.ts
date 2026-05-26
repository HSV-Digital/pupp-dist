import { describe, expect, it } from 'vitest';
import {
	resolveAuditActorContext,
	resolveAuthenticatedAuditActorContext,
} from './audit-actor-context';

describe('audit actor context', () => {
	it('uses the authenticated user tenant and stable user id', () => {
		expect(
			resolveAuthenticatedAuditActorContext({
				userType: 'internal',
				userId: 'user-1',
				orgId: null,
				entraObjectId: 'entra-1',
				tenantId: 'tenant-1',
				email: 'User@Example.com',
				canonicalEmail: 'user@example.com',
				claimEmail: 'user@example.com',
				preferredUsername: 'user@example.com',
				subjectId: 'opaque-sub',
				roles: ['ADMIN'],
			}),
		).toEqual({
			actorType: 'user',
			actorId: 'user-1',
			tenantId: 'tenant-1',
			orgId: null,
			userType: 'internal',
		});
	});

	it('falls back to anonymous context when no user is present', () => {
		expect(resolveAuditActorContext(undefined, 'default-tenant')).toEqual({
			actorType: 'anonymous',
			actorId: null,
			tenantId: 'default-tenant',
		});
	});

	it('preserves reseller userType when resolving audit actor context', () => {
		expect(
			resolveAuthenticatedAuditActorContext({
				userType: 'reseller',
				userId: 'reseller-user-1',
				orgId: 'org-1',
				tenantId: 'org-1',
				email: 'partner.user@contoso.com',
				canonicalEmail: 'partner.user@contoso.com',
				name: 'Partner User',
				provider: 'entra',
				providerSubject: 'subject-1',
				issuer: 'https://login.microsoftonline.com/common/v2.0',
				externalTenantId: 'external-tenant-1',
				displayName: 'Partner User',
			}),
		).toEqual({
			actorType: 'user',
			actorId: 'reseller-user-1',
			tenantId: 'org-1',
			orgId: 'org-1',
			userType: 'reseller',
		});
	});
});
