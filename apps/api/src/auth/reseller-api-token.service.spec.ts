import { vi } from 'vitest';
import { GoneException, UnauthorizedException } from '@nestjs/common';
import { ResellerApiTokenService } from './reseller-api-token.service';

describe('ResellerApiTokenService', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates and verifies a reseller-scoped token', () => {
		const service = new ResellerApiTokenService();
		const token = service.createToken({
			userId: 'reseller-user-1',
			orgId: 'org-1',
			email: 'Partner.User@Contoso.com',
			displayName: 'Partner User',
			providerSubject: 'subject-1',
			issuer: 'https://login.microsoftonline.com/tenant-1/v2.0',
			externalTenantId: 'tenant-1',
		});

		const payload = service.verifyToken({
			token,
			userId: 'reseller-user-1',
			orgId: 'org-1',
		});

		expect(payload.userType).toBe('reseller');
		expect(payload.sub).toBe('reseller-user-1');
		expect(payload.orgId).toBe('org-1');
		expect(payload.email).toBe('partner.user@contoso.com');
		expect(payload.displayName).toBe('Partner User');
		expect(payload.provider).toBe('entra');
		expect(payload.providerSubject).toBe('subject-1');
		expect(payload.issuer).toBe(
			'https://login.microsoftonline.com/tenant-1/v2.0',
		);
		expect(payload.externalTenantId).toBe('tenant-1');
	});

	it('preserves provider identity details when provided', () => {
		const service = new ResellerApiTokenService();
		const token = service.createToken({
			userId: 'reseller-user-1',
			orgId: 'org-1',
			email: 'partner.user@contoso.com',
			providerSubject: 'subject-1',
			externalTenantId: 'external-tenant-1',
		});

		const payload = service.verifyToken({ token, orgId: 'org-1' });
		expect(payload.externalTenantId).toBe('external-tenant-1');
	});

	it('rejects tampered signatures', () => {
		const service = new ResellerApiTokenService();
		const token = service.createToken({
			userId: 'reseller-user-1',
			orgId: 'org-1',
			email: 'partner.user@contoso.com',
			providerSubject: 'subject-1',
		});

		expect(() =>
			service.verifyToken({
				token: `${token}tampered`,
				orgId: 'org-1',
			}),
		).toThrow(UnauthorizedException);
	});

	it('rejects expired tokens and allows historical reads', () => {
		const service = new ResellerApiTokenService();
		const now = new Date('2026-03-13T00:00:00.000Z').getTime();

		vi.spyOn(Date, 'now').mockReturnValue(now);
		const token = service.createToken({
			userId: 'reseller-user-1',
			orgId: 'org-1',
			email: 'partner.user@contoso.com',
			ttlSeconds: 1,
			providerSubject: 'subject-1',
		});

		vi.spyOn(Date, 'now').mockReturnValue(now + 3_000);

		expect(() => service.verifyToken({ token, orgId: 'org-1' })).toThrow(
			GoneException,
		);
		expect(service.readHistoricalTokenPayload(token).orgId).toBe('org-1');
	});

	it('rejects user and org binding mismatches', () => {
		const service = new ResellerApiTokenService();
		const token = service.createToken({
			userId: 'reseller-user-1',
			orgId: 'org-1',
			email: 'partner.user@contoso.com',
			providerSubject: 'subject-1',
		});

		expect(() =>
			service.verifyToken({
				token,
				userId: 'reseller-user-2',
			}),
		).toThrow(UnauthorizedException);
		expect(() =>
			service.verifyToken({
				token,
				orgId: 'org-2',
			}),
		).toThrow(UnauthorizedException);
	});
});
