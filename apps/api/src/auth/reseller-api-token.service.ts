import crypto from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { getEnv } from '../config/env';
import type {
	CreateResellerApiTokenInput,
	ResellerApiTokenPayload,
} from './reseller-api-token.types';
import {
	encodeResellerApiTokenPayload,
	readSignedResellerApiTokenPayload,
	signResellerApiTokenPayload,
} from './reseller-api-token.utils';

@Injectable()
export class ResellerApiTokenService {
	private readonly env = getEnv();

	createToken(input: CreateResellerApiTokenInput): string {
		const issuedAt = Math.floor(Date.now() / 1000);
		const ttlSeconds =
			input.ttlSeconds && input.ttlSeconds > 0
				? Math.floor(input.ttlSeconds)
				: this.env.resellerApiTokenTtlSeconds;

		const payload: ResellerApiTokenPayload = {
			v: 1,
			userType: 'reseller',
			sub: input.userId,
			orgId: input.orgId,
			email: input.email.trim().toLowerCase(),
			displayName: input.displayName ?? null,
			provider: input.provider ?? 'entra',
			providerSubject: input.providerSubject,
			issuer: input.issuer ?? null,
			externalTenantId: input.externalTenantId ?? null,
			mpnId: input.mpnId ?? null,
			iat: issuedAt,
			exp: issuedAt + ttlSeconds,
			jti: crypto.randomUUID(),
		};

		const encodedPayload = encodeResellerApiTokenPayload(payload);
		const signature = this.sign(encodedPayload);

		return `${encodedPayload}.${signature}`;
	}

	readTokenPayload(token: string | undefined): ResellerApiTokenPayload {
		return readSignedResellerApiTokenPayload({
			token,
			secret: this.env.resellerApiTokenSecret,
		});
	}

	readHistoricalTokenPayload(
		token: string | undefined,
	): ResellerApiTokenPayload {
		return readSignedResellerApiTokenPayload({
			token,
			secret: this.env.resellerApiTokenSecret,
			allowExpired: true,
		});
	}

	verifyToken(params: {
		token: string | undefined;
		userId?: string;
		orgId?: string;
	}): ResellerApiTokenPayload {
		const payload = this.readTokenPayload(params.token);

		if (params.userId && payload.sub !== params.userId) {
			throw new UnauthorizedException(
				'Reseller API token is not valid for this user',
			);
		}

		if (params.orgId && payload.orgId !== params.orgId) {
			throw new UnauthorizedException(
				'Reseller API token is not valid for this organization',
			);
		}

		return payload;
	}

	private sign(encodedPayload: string): string {
		return signResellerApiTokenPayload(
			encodedPayload,
			this.env.resellerApiTokenSecret,
		);
	}
}
