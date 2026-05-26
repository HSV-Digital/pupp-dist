import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { getEnv } from '../../config/env';
import { resolveAuthenticatedIdentity } from '../auth-user-identity';
import type { ResellerBootstrapUser } from '../interfaces/reseller-bootstrap-user.interface';

interface EntraIdTokenPayload {
	sub: string;
	email?: string;
	preferred_username?: string;
	name?: string;
	tid?: string;
	iss?: string;
	aud?: string | string[];
	exp: number;
	iat: number;
}

function normalizeIssuer(issuer: string): string {
	return issuer.trim().toLowerCase().replace(/\/+$/u, '');
}

function isAcceptedIssuer(issuer: string, tenantId: string): boolean {
	const normalizedTenantId = tenantId.trim().toLowerCase();
	const normalizedIssuer = normalizeIssuer(issuer);

	const acceptedIssuers = new Set([
		`https://login.microsoftonline.com/${normalizedTenantId}`,
		`https://login.microsoftonline.com/${normalizedTenantId}/v2.0`,
		`https://sts.windows.net/${normalizedTenantId}`,
	]);

	return acceptedIssuers.has(normalizedIssuer);
}

@Injectable()
export class ResellerBootstrapEntraStrategy extends PassportStrategy(
	Strategy,
	'reseller-entra-bootstrap',
) {
	constructor() {
		const env = getEnv();
		const audience = env.azureAdResellerClientId.trim();
		if (!audience) {
			throw new Error(
				'AZURE_AD_RESELLER_CLIENT_ID environment variable is required for reseller bootstrap token validation',
			);
		}
		const allowedAudiences = [audience, `api://${audience}`];

		super({
			passReqToCallback: true,
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKeyProvider: passportJwtSecret({
				cache: true,
				rateLimit: true,
				jwksRequestsPerMinute: 5,
				jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
			}) as never,
			issuer: undefined,
			audience: allowedAudiences,
			algorithms: ['RS256'],
		});
	}

	async validate(
		request: Request,
		payload: EntraIdTokenPayload,
	): Promise<ResellerBootstrapUser> {
		if (!this.allowsBootstrapRequest(request)) {
			throw new UnauthorizedException('Invalid reseller bootstrap route');
		}

		if (
			!payload.tid ||
			!payload.iss ||
			!isAcceptedIssuer(payload.iss, payload.tid)
		) {
			throw new UnauthorizedException('Invalid token issuer');
		}

		const identity = resolveAuthenticatedIdentity({
			email: payload.email,
			preferredUsername: payload.preferred_username,
			sub: payload.sub,
		});

		if (!identity.canonicalEmail) {
			throw new UnauthorizedException('Reseller bootstrap requires an email');
		}

		return {
			provider: 'entra',
			providerSubject: identity.subjectId,
			email: identity.canonicalEmail,
			displayName: payload.name ?? null,
			issuer: payload.iss ?? null,
			externalTenantId: payload.tid ?? null,
		};
	}

	private allowsBootstrapRequest(request: Request): boolean {
		const requestPath = request.path || request.originalUrl || '';
		return requestPath === '/api/reseller/auth/bootstrap';
	}
}
