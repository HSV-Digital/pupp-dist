import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
	requestId: string;
	startedAtMs: number;
}

interface RequestWithContext extends Request {
	requestContext?: RequestContext;
}

export function requestContextMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const headerValue = req.header('x-request-id')?.trim();
	const requestId =
		typeof headerValue === 'string' && headerValue.length > 0
			? headerValue
			: randomUUID();

	(req as RequestWithContext).requestContext = {
		requestId,
		startedAtMs: Date.now(),
	};

	res.setHeader('X-Request-Id', requestId);
	next();
}

export function getRequestId(req?: Request): string | null {
	if (!req) {
		return null;
	}

	const requestWithContext = req as RequestWithContext;
	return requestWithContext.requestContext?.requestId ?? null;
}

export function getRequestDurationMs(req?: Request): number | null {
	if (!req) {
		return null;
	}

	const requestWithContext = req as RequestWithContext;
	const startedAtMs = requestWithContext.requestContext?.startedAtMs;
	if (!startedAtMs) {
		return null;
	}

	const durationMs = Date.now() - startedAtMs;
	if (!Number.isFinite(durationMs) || durationMs < 0) {
		return 0;
	}

	return durationMs;
}
