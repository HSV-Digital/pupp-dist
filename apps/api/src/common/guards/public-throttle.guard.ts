import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PublicThrottleGuard extends ThrottlerGuard {
	protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();
		// Skip throttling for authenticated users
		if (request.user) {
			return true;
		}
		return false;
	}

	protected async getTracker(req: Record<string, any>): Promise<string> {
		const ip = req.ip ?? req.ips?.[0] ?? 'unknown';
		return typeof ip === 'string' ? ip : 'unknown';
	}
}
