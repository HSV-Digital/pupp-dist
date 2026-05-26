import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbTransaction = vi.fn();
const mockSqlEnd = vi.fn();
const mockTxSelect = vi.fn();
const mockTxFrom = vi.fn();
const mockTxWhere = vi.fn();
const mockTxLimit = vi.fn();
const mockTxInsert = vi.fn();
const mockTxValues = vi.fn();
const mockTxInsertReturning = vi.fn();
const mockTxOnConflictDoUpdate = vi.fn();
const mockTxUpdate = vi.fn();
const mockTxSet = vi.fn();
const mockTxUpdateWhere = vi.fn();
const mockTxUpdateReturning = vi.fn();

vi.mock('../database/connection', () => ({
	createDatabaseClient: () => ({
		db: {
			transaction: mockDbTransaction,
		},
		sql: { end: mockSqlEnd },
	}),
}));

vi.mock('../database/database-url', () => ({
	resolveDatabaseUrl: () => 'postgres://localhost:5432/test',
}));

import { ResellerAuthService } from './reseller-auth.service';

describe('ResellerAuthService', () => {
	const resellerApiTokenService = {
		createToken: vi.fn(),
		readTokenPayload: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();

		mockTxSelect.mockReturnValue({ from: mockTxFrom });
		mockTxFrom.mockReturnValue({ where: mockTxWhere });
		mockTxWhere.mockReturnValue({ limit: mockTxLimit });
		mockTxInsert.mockReturnValue({ values: mockTxValues });
		mockTxValues.mockReturnValue({
			returning: mockTxInsertReturning,
			onConflictDoUpdate: mockTxOnConflictDoUpdate,
		});
		mockTxUpdate.mockReturnValue({ set: mockTxSet });
		mockTxSet.mockReturnValue({ where: mockTxUpdateWhere });
		mockTxUpdateWhere.mockReturnValue({ returning: mockTxUpdateReturning });
		mockDbTransaction.mockImplementation(async (callback) =>
			callback({
				select: mockTxSelect,
				insert: mockTxInsert,
				update: mockTxUpdate,
			}),
		);
		resellerApiTokenService.createToken.mockReturnValue('reseller-app-token');
		resellerApiTokenService.readTokenPayload.mockReturnValue({
			exp: 2_000_000_000,
		});
	});

	it('creates a reseller organization, user, and first-party token on first bootstrap', async () => {
		mockTxLimit
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);
		mockTxInsertReturning
			.mockResolvedValueOnce([
				{
					id: 'org-1',
					name: 'Contoso',
					primaryDomain: 'contoso.com',
					normalizedDomain: 'contoso.com',
					isActive: true,
				},
			])
			.mockResolvedValueOnce([
				{
					id: 'reseller-user-1',
					orgId: 'org-1',
					email: 'partner.user@contoso.com',
					displayName: 'Partner User',
					isActive: true,
					lastLoginAt: new Date('2026-03-13T00:00:00.000Z'),
				},
			]);
		mockTxOnConflictDoUpdate.mockResolvedValue(undefined);

		const service = new ResellerAuthService(resellerApiTokenService as never);
		const result = await service.bootstrapResellerUser({
			provider: 'entra',
			providerSubject: 'subject-1',
			email: 'Partner.User@Contoso.com',
			displayName: 'Partner User',
			issuer: 'https://login.microsoftonline.com/tenant-1/v2.0',
			externalTenantId: 'tenant-1',
		});

		expect(mockTxValues).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				name: 'Contoso',
				primaryDomain: 'contoso.com',
				normalizedDomain: 'contoso.com',
			}),
		);
		expect(mockTxValues).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				orgId: 'org-1',
				email: 'partner.user@contoso.com',
				displayName: 'Partner User',
			}),
		);
		expect(mockTxValues).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({
				orgId: 'org-1',
				resellerUserId: 'reseller-user-1',
				provider: 'entra',
				providerSubject: 'subject-1',
				email: 'partner.user@contoso.com',
				issuer: 'https://login.microsoftonline.com/tenant-1/v2.0',
				tenantId: 'tenant-1',
			}),
		);
		expect(resellerApiTokenService.createToken).toHaveBeenCalledWith({
			userId: 'reseller-user-1',
			orgId: 'org-1',
			email: 'partner.user@contoso.com',
			displayName: 'Partner User',
			providerSubject: 'subject-1',
			issuer: 'https://login.microsoftonline.com/tenant-1/v2.0',
			externalTenantId: 'tenant-1',
		});
		expect(result).toEqual({
			user: {
				userType: 'reseller',
				userId: 'reseller-user-1',
				orgId: 'org-1',
				email: 'partner.user@contoso.com',
				displayName: 'Partner User',
			},
			accessToken: 'reseller-app-token',
			accessTokenExpiresAt: 2_000_000_000,
		});
	});

	it('reuses an aliased reseller user inside the resolved organization', async () => {
		mockTxLimit
			.mockResolvedValueOnce([
				{
					id: 'org-1',
					name: 'Contoso',
					primaryDomain: 'contoso.com',
					normalizedDomain: 'contoso.com',
					isActive: true,
				},
			])
			.mockResolvedValueOnce([{ userId: 'reseller-user-1' }])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{
					id: 'reseller-user-1',
					orgId: 'org-1',
					email: 'old.email@contoso.com',
					displayName: 'Old Name',
					isActive: true,
					lastLoginAt: new Date('2026-03-01T00:00:00.000Z'),
				},
			]);
		mockTxUpdateReturning.mockResolvedValue([
			{
				id: 'reseller-user-1',
				orgId: 'org-1',
				email: 'partner.user@contoso.com',
				displayName: 'Partner User',
				isActive: true,
				lastLoginAt: new Date('2026-03-13T00:00:00.000Z'),
			},
		]);
		mockTxOnConflictDoUpdate.mockResolvedValue(undefined);

		const service = new ResellerAuthService(resellerApiTokenService as never);
		const result = await service.bootstrapResellerUser({
			provider: 'entra',
			providerSubject: 'subject-1',
			email: 'partner.user@contoso.com',
			displayName: 'Partner User',
			issuer: 'https://login.microsoftonline.com/tenant-1/v2.0',
			externalTenantId: 'tenant-1',
		});

		expect(mockTxUpdate).toHaveBeenCalledTimes(1);
		expect(mockTxInsertReturning).not.toHaveBeenCalled();
		expect(resellerApiTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'reseller-user-1',
				orgId: 'org-1',
				email: 'partner.user@contoso.com',
			}),
		);
		expect(result.user).toEqual({
			userType: 'reseller',
			userId: 'reseller-user-1',
			orgId: 'org-1',
			email: 'partner.user@contoso.com',
			displayName: 'Partner User',
		});
	});
});
