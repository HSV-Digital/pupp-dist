import {
	CallHandler,
	ExecutionContext,
	HttpException,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../auth/interfaces/auth-user.interface';
import { getRequestId } from '../common/request-context/request-context';
import { PostHogService, type PostHogRequestContext } from './posthog.service';

interface AuthenticatedRequest extends Request {
	user?: AuthenticatedPrincipal;
}

function getHeaderValue(req: Request, name: string): string | undefined {
	const value = req.header(name)?.trim();
	return value && value.length > 0 ? value : undefined;
}

function resolveDistinctId(req: AuthenticatedRequest): string | undefined {
	return (
		getHeaderValue(req, 'x-posthog-distinct-id') ??
		req.user?.canonicalEmail ??
		req.user?.email ??
		undefined
	);
}

function resolveIpAddress(req: Request): string | undefined {
	const forwardedFor = req.header('x-forwarded-for')?.trim();
	if (forwardedFor) {
		return forwardedFor.split(',')[0]?.trim() ?? undefined;
	}

	return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

function buildRequestContext(req: AuthenticatedRequest): PostHogRequestContext {
	const windowId = getHeaderValue(req, 'x-posthog-window-id');

	return {
		distinctId: resolveDistinctId(req),
		sessionId: getHeaderValue(req, 'x-posthog-session-id'),
		properties: {
			$current_url: req.originalUrl ?? req.url ?? undefined,
			$request_method: req.method ?? undefined,
			$request_path: req.path ?? undefined,
			$user_agent: req.header('user-agent') ?? undefined,
			$ip: resolveIpAddress(req),
			$window_id: windowId,
			request_id: getRequestId(req),
		},
	};
}

@Injectable()
export class PostHogRequestInterceptor implements NestInterceptor {
	constructor(private readonly posthogService: PostHogService) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType<'http'>() !== 'http') {
			return next.handle();
		}

		const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
		const posthogContext = buildRequestContext(request);

		return new Observable((subscriber) =>
			this.posthogService.withRequestContext(posthogContext, () => {
				const subscription = next.handle().subscribe({
					next: (value) => subscriber.next(value),
					error: (error: unknown) => {
						this.captureExceptionIfNeeded(error, posthogContext.distinctId);
						subscriber.error(error);
					},
					complete: () => subscriber.complete(),
				});

				return () => subscription.unsubscribe();
			}),
		);
	}

	private captureExceptionIfNeeded(error: unknown, distinctId?: string): void {
		const status =
			error instanceof HttpException ? error.getStatus() : undefined;
		if (status !== undefined && status < 500) {
			return;
		}

		this.posthogService.captureException(error, distinctId, {
			$response_status_code: status ?? 500,
		});
	}
}
