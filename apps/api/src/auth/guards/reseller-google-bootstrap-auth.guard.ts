import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ResellerGoogleBootstrapAuthGuard extends AuthGuard(
	'reseller-google-bootstrap',
) {
	handleRequest<TUser = unknown>(
		err: unknown,
		user: TUser,
		info?: { message?: string },
	): TUser {
		if (err || !user) {
			const message =
				info?.message ??
				(err instanceof Error && err.message ? err.message : 'Unauthorized');
			throw new UnauthorizedException(message);
		}

		return user;
	}
}
