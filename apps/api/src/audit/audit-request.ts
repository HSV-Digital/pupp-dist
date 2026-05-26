import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import {
	getRequestDurationMs,
	getRequestId,
} from '../common/request-context/request-context';

export interface RequestAuditFields {
	requestId: string | null;
	route: string | null;
	httpMethod: string | null;
	durationMs: number | null;
}

export function getRequestAuditFields(req?: Request): RequestAuditFields {
	if (!req) {
		return {
			requestId: null,
			route: null,
			httpMethod: null,
			durationMs: null,
		};
	}

	return {
		requestId: getRequestId(req),
		route: req.originalUrl ?? req.url ?? null,
		httpMethod: req.method ?? null,
		durationMs: getRequestDurationMs(req),
	};
}

export function getErrorStatus(error: unknown): number | null {
	if (error instanceof HttpException) {
		return error.getStatus();
	}

	return null;
}
