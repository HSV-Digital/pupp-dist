import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class DemoThrottleGuard extends ThrottlerGuard {
	protected async getTracker(req: Record<string, any>): Promise<string> {
		const ip = req.ip ?? req.ips?.[0] ?? 'unknown';
		return typeof ip === 'string' ? ip : 'unknown';
	}
}
