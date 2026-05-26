import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
	ConflictException,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import {
	resellerOrganizations,
	resellerUserIdentityAliases,
	resellerUsers,
} from '../database/schema';
import { ResellerApiTokenService } from './reseller-api-token.service';
import {
	assertResellerCompanyEmail,
	deriveResellerOrganizationName,
} from './reseller-domain';
import type { ResellerBootstrapUser } from './interfaces/reseller-bootstrap-user.interface';

type AuthDatabase = ReturnType<typeof createDatabaseClient>['db'];
type AuthTransaction = Parameters<
	Parameters<AuthDatabase['transaction']>[0]
>[0];

interface ResellerUserRecord {
	id: string;
	orgId: string;
	email: string;
	displayName: string | null;
	isActive: boolean;
	lastLoginAt: Date | null;
}

export interface ResellerBootstrapResult {
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

@Injectable()
export class ResellerAuthService implements OnModuleDestroy {
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;
	private readonly sql = this.databaseClient.sql;

	constructor(
		private readonly resellerApiTokenService: ResellerApiTokenService,
	) {}

	async bootstrapResellerUser(
		input: ResellerBootstrapUser,
	): Promise<ResellerBootstrapResult> {
		let normalized: ReturnType<typeof assertResellerCompanyEmail>;
		try {
			normalized = assertResellerCompanyEmail(input.email);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes('Generic email domains')
			) {
				throw new ForbiddenException(error.message);
			}
			throw error;
		}
		const now = new Date();

		const result = await this.db.transaction(async (tx) => {
			const organization = await this.resolveOrganization(
				tx,
				normalized.domain,
				now,
				input.mpnId ?? null,
			);
			const user = await this.resolveUser(tx, {
				organizationId: organization.id,
				email: normalized.email,
				displayName: input.displayName ?? null,
				now,
				provider: input.provider,
				providerSubject: input.providerSubject,
			});

			await this.upsertIdentityAlias(tx, {
				orgId: organization.id,
				userId: user.id,
				email: normalized.email,
				now,
				provider: input.provider,
				providerSubject: input.providerSubject,
				issuer: input.issuer ?? null,
				externalTenantId: input.externalTenantId ?? null,
			});

			return {
				user,
				organization,
			};
		});

		const accessToken = this.resellerApiTokenService.createToken({
			userId: result.user.id,
			orgId: result.organization.id,
			email: result.user.email,
			displayName: result.user.displayName,
			provider: input.provider,
			providerSubject: input.providerSubject,
			issuer: input.issuer ?? null,
			externalTenantId: input.externalTenantId ?? null,
			mpnId: result.organization.mpnId ?? null,
		});
		const payload = this.resellerApiTokenService.readTokenPayload(accessToken);

		return {
			user: {
				userType: 'reseller',
				userId: result.user.id,
				orgId: result.organization.id,
				email: result.user.email,
				displayName: result.user.displayName,
			},
			accessToken,
			accessTokenExpiresAt: payload.exp,
		};
	}

	async onModuleDestroy(): Promise<void> {
		await this.sql.end();
	}

	private async resolveOrganization(
		tx: AuthTransaction,
		normalizedDomain: string,
		now: Date,
		mpnId: string | null,
	) {
		const [existing] = await tx
			.select()
			.from(resellerOrganizations)
			.where(eq(resellerOrganizations.normalizedDomain, normalizedDomain))
			.limit(1);

		if (existing) {
			if (!existing.isActive) {
				throw new ForbiddenException('Reseller organization is inactive');
			}

			// Update mpnId if not set yet and we have one now
			if (mpnId && !existing.mpnId) {
				await tx
					.update(resellerOrganizations)
					.set({ mpnId, updatedAt: now })
					.where(eq(resellerOrganizations.id, existing.id));
				return { ...existing, mpnId };
			}

			return existing;
		}

		const [created] = await tx
			.insert(resellerOrganizations)
			.values({
				id: randomUUID(),
				name: deriveResellerOrganizationName(normalizedDomain),
				primaryDomain: normalizedDomain,
				normalizedDomain,
				mpnId,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		if (!created) {
			throw new UnauthorizedException('Failed to create reseller organization');
		}

		return created;
	}

	private async resolveUser(
		tx: AuthTransaction,
		params: {
			organizationId: string;
			email: string;
			displayName: string | null;
			now: Date;
			provider: 'entra' | 'google' | 'email';
			providerSubject: string;
		},
	): Promise<ResellerUserRecord> {
		const [aliasMatch] = await tx
			.select({
				userId: resellerUserIdentityAliases.resellerUserId,
			})
			.from(resellerUserIdentityAliases)
			.where(
				and(
					eq(resellerUserIdentityAliases.provider, params.provider),
					eq(
						resellerUserIdentityAliases.providerSubject,
						params.providerSubject,
					),
				),
			)
			.limit(1);

		const [directMatch] = await tx
			.select({
				id: resellerUsers.id,
				orgId: resellerUsers.orgId,
				email: resellerUsers.email,
				displayName: resellerUsers.displayName,
				isActive: resellerUsers.isActive,
				lastLoginAt: resellerUsers.lastLoginAt,
			})
			.from(resellerUsers)
			.where(
				and(
					eq(resellerUsers.orgId, params.organizationId),
					sql<boolean>`lower(${resellerUsers.email}) = ${params.email}`,
				),
			)
			.limit(1);

		if (aliasMatch && directMatch && aliasMatch.userId !== directMatch.id) {
			throw new ConflictException(
				'Reseller identity matches multiple existing users',
			);
		}

		if (aliasMatch && aliasMatch.userId !== directMatch?.id) {
			const [aliasedUser] = await tx
				.select({
					id: resellerUsers.id,
					orgId: resellerUsers.orgId,
					email: resellerUsers.email,
					displayName: resellerUsers.displayName,
					isActive: resellerUsers.isActive,
					lastLoginAt: resellerUsers.lastLoginAt,
				})
				.from(resellerUsers)
				.where(eq(resellerUsers.id, aliasMatch.userId))
				.limit(1);

			if (!aliasedUser) {
				throw new UnauthorizedException('Reseller identity alias is invalid');
			}

			if (aliasedUser.orgId !== params.organizationId) {
				throw new ConflictException(
					'Reseller identity is linked to a different organization',
				);
			}

			const [updatedAliasedUser] = await tx
				.update(resellerUsers)
				.set({
					email: params.email,
					displayName: params.displayName,
					isActive: true,
					lastLoginAt: params.now,
					updatedAt: params.now,
				})
				.where(eq(resellerUsers.id, aliasedUser.id))
				.returning({
					id: resellerUsers.id,
					orgId: resellerUsers.orgId,
					email: resellerUsers.email,
					displayName: resellerUsers.displayName,
					isActive: resellerUsers.isActive,
					lastLoginAt: resellerUsers.lastLoginAt,
				});

			if (!updatedAliasedUser) {
				throw new UnauthorizedException('Failed to update reseller user');
			}

			return updatedAliasedUser;
		}

		if (directMatch) {
			const [updatedDirectUser] = await tx
				.update(resellerUsers)
				.set({
					email: params.email,
					displayName: params.displayName,
					isActive: true,
					lastLoginAt: params.now,
					updatedAt: params.now,
				})
				.where(eq(resellerUsers.id, directMatch.id))
				.returning({
					id: resellerUsers.id,
					orgId: resellerUsers.orgId,
					email: resellerUsers.email,
					displayName: resellerUsers.displayName,
					isActive: resellerUsers.isActive,
					lastLoginAt: resellerUsers.lastLoginAt,
				});

			if (!updatedDirectUser) {
				throw new UnauthorizedException('Failed to update reseller user');
			}

			return updatedDirectUser;
		}

		const [createdUser] = await tx
			.insert(resellerUsers)
			.values({
				id: randomUUID(),
				orgId: params.organizationId,
				email: params.email,
				displayName: params.displayName,
				isActive: true,
				lastLoginAt: params.now,
				createdAt: params.now,
				updatedAt: params.now,
			})
			.returning({
				id: resellerUsers.id,
				orgId: resellerUsers.orgId,
				email: resellerUsers.email,
				displayName: resellerUsers.displayName,
				isActive: resellerUsers.isActive,
				lastLoginAt: resellerUsers.lastLoginAt,
			});

		if (!createdUser) {
			throw new UnauthorizedException('Failed to create reseller user');
		}

		return createdUser;
	}

	private async upsertIdentityAlias(
		tx: AuthTransaction,
		params: {
			orgId: string;
			userId: string;
			email: string;
			now: Date;
			provider: 'entra' | 'google' | 'email';
			providerSubject: string;
			issuer: string | null;
			externalTenantId: string | null;
		},
	): Promise<void> {
		await tx
			.insert(resellerUserIdentityAliases)
			.values({
				id: randomUUID(),
				orgId: params.orgId,
				resellerUserId: params.userId,
				provider: params.provider,
				providerSubject: params.providerSubject,
				email: params.email,
				issuer: params.issuer,
				tenantId: params.externalTenantId,
				firstSeenAt: params.now,
				lastSeenAt: params.now,
				createdAt: params.now,
				updatedAt: params.now,
			})
			.onConflictDoUpdate({
				target: [
					resellerUserIdentityAliases.provider,
					resellerUserIdentityAliases.providerSubject,
				],
				set: {
					orgId: sql`excluded.org_id`,
					resellerUserId: sql`excluded.reseller_user_id`,
					email: sql`excluded.email`,
					issuer: sql`excluded.issuer`,
					tenantId: sql`excluded.tenant_id`,
					firstSeenAt: sql`LEAST(${resellerUserIdentityAliases.firstSeenAt}, excluded.first_seen_at)`,
					lastSeenAt: sql`GREATEST(${resellerUserIdentityAliases.lastSeenAt}, excluded.last_seen_at)`,
					updatedAt: params.now,
				},
			});
	}
}
