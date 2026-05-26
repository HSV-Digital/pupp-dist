import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostHogQueryService } from './posthog-query.service';

interface MockResponseInit {
	body?: QueryBody;
	headers?: Record<string, string>;
	status: number;
}

interface QueryBody {
	columns?: string[];
	results?: unknown[];
}

vi.mock('../config/env', () => ({
	getEnv: () => ({
		posthogQueryHost: 'https://us.posthog.com',
		posthogWebProjectId: '1',
		posthogPersonalApiKey: 'phx_test',
	}),
}));

function createMockResponse(init: MockResponseInit): Response {
	const headers = new Map(
		Object.entries(init.headers ?? {}).map(([key, value]) => [
			key.toLowerCase(),
			value,
		]),
	);
	const bodyText =
		typeof init.body === 'undefined' ? '' : JSON.stringify(init.body);

	return {
		status: init.status,
		ok: init.status >= 200 && init.status < 300,
		headers: {
			get: (name: string) => headers.get(name.toLowerCase()) ?? null,
		},
		json: vi.fn().mockResolvedValue(init.body ?? {}),
		text: vi.fn().mockResolvedValue(bodyText),
	} as unknown as Response;
}

describe('PostHogQueryService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('retries 504 responses with the longer backoff and returns the retried result', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(createMockResponse({ status: 504 }))
			.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: {
						columns: ['value'],
						results: [[1]],
					},
				}),
			);
		const warnSpy = vi
			.spyOn(Logger.prototype, 'warn')
			.mockImplementation(() => {
				return undefined;
			});

		vi.stubGlobal('fetch', fetchMock);

		const service = new PostHogQueryService();
		const resultPromise = service.runHogQL<{ value: number }>(
			'SELECT 1 AS value',
			'test.query',
		);

		await Promise.resolve();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('PostHog 504 for test.query, retrying in 3000ms'),
		);

		await vi.advanceTimersByTimeAsync(3000);

		await expect(resultPromise).resolves.toEqual([{ value: 1 }]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
