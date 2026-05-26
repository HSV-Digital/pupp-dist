import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { getEnv } from '../config/env';

export interface PostHogRequestContext {
	distinctId?: string;
	sessionId?: string;
	properties?: Record<string, unknown>;
}

function sanitizeProperties(
	properties?: Record<string, unknown>,
): Record<string, unknown> | undefined {
	if (!properties) {
		return undefined;
	}

	const sanitizedEntries = Object.entries(properties).filter(
		([, value]) => value !== undefined,
	);
	if (sanitizedEntries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(sanitizedEntries);
}

@Injectable()
export class PostHogService implements OnModuleDestroy {
	private readonly logger = new Logger(PostHogService.name);
	private readonly env = getEnv();
	private readonly client =
		this.env.posthogProjectToken.trim().length > 0
			? new PostHog(this.env.posthogProjectToken, {
					host: this.env.posthogCaptureHost,
				})
			: null;

	get isEnabled(): boolean {
		return this.client !== null;
	}

	withRequestContext<T>(context: PostHogRequestContext, fn: () => T): T {
		if (!this.client) {
			return fn();
		}

		return this.client.withContext(
			{
				distinctId: context.distinctId,
				sessionId: context.sessionId,
				properties: sanitizeProperties(context.properties),
			},
			fn,
		);
	}

	capture(params: {
		event: string;
		distinctId?: string;
		properties?: Record<string, unknown>;
	}): void {
		if (!this.client) {
			return;
		}

		try {
			this.client.capture({
				event: params.event,
				distinctId: params.distinctId,
				properties: sanitizeProperties(params.properties),
			});
		} catch (error) {
			this.logger.warn(
				`Failed to capture PostHog event ${params.event}: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	captureException(
		error: unknown,
		distinctId?: string,
		properties?: Record<string, unknown>,
	): void {
		if (!this.client) {
			return;
		}

		try {
			this.client.captureException(
				error,
				distinctId,
				sanitizeProperties(properties),
			);
		} catch (captureError) {
			this.logger.warn(
				`Failed to capture PostHog exception: ${
					captureError instanceof Error ? captureError.message : 'Unknown error'
				}`,
			);
		}
	}

	async onModuleDestroy(): Promise<void> {
		if (!this.client) {
			return;
		}

		await this.client._shutdown(5000);
	}
}
