import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { getEnv } from '../../config/env';
import { resolveAuthenticatedIdentity } from '../auth-user-identity';
import type { ResellerBootstrapUser } from '../interfaces/reseller-bootstrap-user.interface';

interface GoogleIdTokenPayload {
	sub: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	hd?: string;
	iss?: string;
	aud?: string | string[];
	exp: number;
	iat: number;
}

const ACCEPTED_GOOGLE_ISSUERS = new Set([
	'https://accounts.google.com',
	'accounts.google.com',
]);

@Injectable()
export class ResellerBootstrapGoogleStrategy extends PassportStrategy(
	Strategy,
	'reseller-google-bootstrap',
) {
	constructor() {
		const audience = getEnv().googleClientId.trim();
		if (!audience) {
			throw new Error(
				'GOOGLE_CLIENT_ID environment variable is required for reseller Google bootstrap token validation',
			);
		}

		super({
			passReqToCallback: true,
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKeyProvider: passportJwtSecret({
				cache: true,
				rateLimit: true,
				jwksRequestsPerMinute: 5,
				jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
			}) as never,
			issuer: ['https://accounts.google.com', 'accounts.google.com'],
			audience,
			algorithms: ['RS256'],
		});
	}

	async validate(
		request: Request,
		payload: GoogleIdTokenPayload,
	): Promise<ResellerBootstrapUser> {
		if (!this.allowsBootstrapRequest(request)) {
			throw new UnauthorizedException(
				'Invalid reseller Google bootstrap route',
			);
		}

		if (!payload.iss || !ACCEPTED_GOOGLE_ISSUERS.has(payload.iss)) {
			throw new UnauthorizedException('Invalid Google token issuer');
		}

		if (!payload.email_verified) {
			throw new UnauthorizedException('Google email is not verified');
		}

		const identity = resolveAuthenticatedIdentity({
			email: payload.email,
			preferredUsername: undefined,
			sub: payload.sub,
		});

		if (!identity.canonicalEmail) {
			throw new UnauthorizedException(
				'Reseller Google bootstrap requires an email',
			);
		}

		return {
			provider: 'google',
			providerSubject: identity.subjectId,
			email: identity.canonicalEmail,
			displayName: payload.name ?? null,
			issuer: payload.iss ?? null,
			externalTenantId: payload.hd ?? null,
		};
	}

	private allowsBootstrapRequest(request: Request): boolean {
		const requestPath = request.path || request.originalUrl || '';
		return requestPath === '/api/reseller/auth/google-bootstrap';
	}
}
