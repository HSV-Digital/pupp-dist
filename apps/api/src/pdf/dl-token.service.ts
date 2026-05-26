import { randomUUID } from 'node:crypto';
import {
	GoneException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getEnv } from '../config/env';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { downloadTokenRedemptions } from '../database/schema';
import type {
	CreateDlTokenInput,
	DlTokenPayload,
	DlTokenScope,
} from './types/dl-token.types';
import {
	encryptDlTokenPayload,
	readEncryptedDlTokenPayload,
	readSignedDlTokenPayload,
} from './dl-token.utils';

@Injectable()
export class DlTokenService implements OnModuleDestroy {
	private readonly env = getEnv();
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;

	createToken(input: CreateDlTokenInput): string {
		const issuedAt = Math.floor(Date.now() / 1000);
		const ttlSeconds =
			input.ttlSeconds && input.ttlSeconds > 0
				? Math.floor(input.ttlSeconds)
				: this.env.pdfDlTokenTtlSeconds;

		const payload: DlTokenPayload = {
			v: 2,
			scope: input.scope,
			tenantId: input.tenantId,
			filters: input.filters,
			sort: input.sort,
			selectedSkuIds: input.selectedSkuIds,
			resellerId: input.resellerId,
			customerId: input.customerId,
			orgId: input.orgId,
			selectedAssets: input.selectedAssets,
			proposalOptionsEmail: input.proposalOptionsEmail,
			opportunityListEmail: input.opportunityListEmail,
			customerProposalEmail: input.customerProposalEmail,
			partnerProposalEmail: input.partnerProposalEmail,
			proposalAssetsBundle: input.proposalAssetsBundle,
			proposalPpt: input.proposalPpt,
			demoPdfList: input.demoPdfList,
			singleUse: input.singleUse === true,
			iat: issuedAt,
			exp: issuedAt + ttlSeconds,
			jti: randomUUID(),
		};

		return encryptDlTokenPayload({
			payload,
			encryptionKey: this.env.dlTokenEncryptionKey,
		});
	}

	readTokenPayload(token: string | undefined): DlTokenPayload {
		if (!token || token.trim().length === 0) {
			throw new UnauthorizedException('Missing download token');
		}

		return readEncryptedDlTokenPayload({
			token,
			encryptionKey: this.env.dlTokenEncryptionKey,
		});
	}

	readHistoricalTokenPayload(token: string | undefined): DlTokenPayload {
		try {
			return readEncryptedDlTokenPayload({
				token,
				encryptionKey: this.env.dlTokenEncryptionKey,
				allowExpired: true,
			});
		} catch {
			return readSignedDlTokenPayload({
				token,
				secret: this.env.pdfDlTokenSecret,
				allowExpired: true,
			});
		}
	}

	verifyTokenForScope(params: {
		token: string | undefined;
		scope: DlTokenScope;
		resellerId?: string;
		customerId?: string;
	}): DlTokenPayload {
		const payload = this.readTokenPayload(params.token);

		if (payload.tenantId !== this.env.defaultTenantId) {
			throw new UnauthorizedException('Token tenant does not match scope');
		}

		if (payload.scope !== params.scope) {
			throw new UnauthorizedException('Invalid token scope for this endpoint');
		}

		if (params.resellerId && payload.resellerId !== params.resellerId) {
			throw new UnauthorizedException('Token is not valid for this reseller');
		}

		if (params.customerId && payload.customerId !== params.customerId) {
			throw new UnauthorizedException('Token is not valid for this customer');
		}

		return payload;
	}

	async assertTokenAvailable(
		token: string | undefined,
	): Promise<DlTokenPayload> {
		const payload = this.readTokenPayload(token);
		if (!payload.singleUse) {
			return payload;
		}

		const existingRedemption =
			await this.db.query.downloadTokenRedemptions.findFirst({
				where: eq(downloadTokenRedemptions.tokenJti, payload.jti),
				columns: { tokenJti: true },
			});
		if (existingRedemption) {
			throw new GoneException('Download link has already been used');
		}

		return payload;
	}

	async consumeToken(params: {
		token: string | undefined;
		requestId?: string | null;
		route?: string | null;
	}): Promise<DlTokenPayload> {
		const payload = this.readTokenPayload(params.token);
		if (!payload.singleUse) {
			return payload;
		}

		const [insertedRedemption] = await this.db
			.insert(downloadTokenRedemptions)
			.values({
				tokenJti: payload.jti,
				tokenScope: payload.scope,
				requestId: params.requestId ?? null,
				route: params.route ?? null,
			})
			.onConflictDoNothing()
			.returning({ tokenJti: downloadTokenRedemptions.tokenJti });

		if (!insertedRedemption) {
			throw new GoneException('Download link has already been used');
		}

		return payload;
	}

	async onModuleDestroy(): Promise<void> {
		await this.databaseClient.sql.end();
	}
}
