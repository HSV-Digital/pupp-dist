import { vi } from 'vitest';
import type { Request, Response } from 'express';
import {
	getRequestDurationMs,
	getRequestId,
	requestContextMiddleware,
} from './request-context';

describe('requestContextMiddleware', () => {
	it('sets request context and response header', () => {
		const headers = new Map<string, string>();
		const req = {
			header: vi.fn().mockReturnValue(undefined),
		} as unknown as Request;

		const res = {
			setHeader: vi.fn((key: string, value: string) => {
				headers.set(key, value);
			}),
		} as unknown as Response;

		const next = vi.fn();

		requestContextMiddleware(req, res, next);

		const requestId = getRequestId(req);
		expect(requestId).toBeTruthy();
		expect(headers.get('X-Request-Id')).toBe(requestId);
		expect(next).toHaveBeenCalled();
	});

	it('uses incoming x-request-id when provided', () => {
		const req = {
			header: vi.fn().mockReturnValue('existing-id'),
		} as unknown as Request;

		const setHeaderMock = vi.fn();
		const res = {
			setHeader: setHeaderMock,
		} as unknown as Response;

		requestContextMiddleware(req, res, vi.fn());

		expect(getRequestId(req)).toBe('existing-id');
		expect(setHeaderMock).toHaveBeenCalledWith('X-Request-Id', 'existing-id');
	});

	it('returns a non-negative duration', () => {
		const req = {
			header: vi.fn().mockReturnValue(undefined),
		} as unknown as Request;
		const res = {
			setHeader: vi.fn(),
		} as unknown as Response;

		requestContextMiddleware(req, res, vi.fn());

		const duration = getRequestDurationMs(req);
		expect(duration).not.toBeNull();
		expect(duration).toBeGreaterThanOrEqual(0);
	});
});
