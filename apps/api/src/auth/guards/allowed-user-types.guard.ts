import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../constants/auth.constants';
import { ALLOWED_USER_TYPES_KEY } from '../decorators/allowed-user-types.decorator';
import type {
	AuthenticatedPrincipal,
	AuthenticatedUserType,
} from '../interfaces/auth-user.interface';

@Injectable()
export class AllowedUserTypesGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);

		const allowedTypes = this.reflector.getAllAndOverride<
			AuthenticatedUserType[] | undefined
		>(ALLOWED_USER_TYPES_KEY, [context.getHandler(), context.getClass()]);

		const request = context.switchToHttp().getRequest<Request>();
		const user = (request as Request & { user?: AuthenticatedPrincipal }).user;

		// @Public() with no user → anonymous access allowed
		if (isPublic && !user) {
			return true;
		}

		// @Public() with a user present → allow any type
		if (isPublic && user && !allowedTypes) {
			return true;
		}

		// @AllowedUserTypes(...) specified → check user type
		if (allowedTypes) {
			if (!user) {
				throw new ForbiddenException('Access denied');
			}
			if (!allowedTypes.includes(user.userType)) {
				throw new ForbiddenException('Access denied');
			}
			return true;
		}

		// No decorator → default to internal only (backward-compatible)
		if (!user || user.userType !== 'internal') {
			throw new ForbiddenException('Access denied');
		}

		return true;
	}
}
