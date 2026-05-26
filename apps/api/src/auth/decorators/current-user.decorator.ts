import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../interfaces/auth-user.interface';

interface AuthenticatedRequest extends Request {
	user?: AuthenticatedPrincipal;
}

export const CurrentUser = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): AuthenticatedPrincipal => {
		const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
		return request.user as AuthenticatedPrincipal;
	},
);
