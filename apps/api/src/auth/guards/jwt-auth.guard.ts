import {
	ExecutionContext,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../constants/auth.constants';
import type { ResellerAuthUser } from '../interfaces/auth-user.interface';
import { ResellerApiTokenService } from '../reseller-api-token.service';

@Injectable()
export class JwtAuthGuard {
	constructor(
		private readonly reflector: Reflector,
		private readonly resellerApiTokenService: ResellerApiTokenService,
	) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();
		const authHeader = request.header('authorization')?.trim();

		if (!authHeader) {
			return this.handleNoToken(context);
		}

		const [scheme, token] = authHeader.split(/\s+/u);
		if (scheme?.toLowerCase() !== 'bearer' || !token) {
			return this.handleNoToken(context);
		}

		try {
			const payload = this.resellerApiTokenService.verifyToken({ token });
			(request as Request & { user?: ResellerAuthUser }).user = {
				userType: 'reseller',
				userId: payload.sub,
				orgId: payload.orgId,
				tenantId: payload.orgId,
				email: payload.email,
				canonicalEmail: payload.email,
				name: payload.displayName ?? undefined,
				provider: payload.provider,
				providerSubject: payload.providerSubject,
				issuer: payload.issuer,
				externalTenantId: payload.externalTenantId,
				displayName: payload.displayName,
				mpnId: payload.mpnId ?? null,
			};
			return true;
		} catch {
			return this.handleNoToken(context);
		}
	}

	private handleNoToken(context: ExecutionContext): boolean {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);

		if (isPublic) {
			return true;
		}

		throw new UnauthorizedException('Unauthorized');
	}
}
