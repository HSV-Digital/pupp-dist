import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostHogEndpointService } from './posthog-endpoint.service';

interface EndpointBody {
	columns?: string[];
	results?: unknown[];
}

interface MockResponseInit {
	body?: EndpointBody;
	headers?: Record<string, string>;
	status: number;
}

vi.mock('../config/env', () => ({
	getEnv: () => ({
		posthogEndpointApiKey: 'phe_test',
		posthogQueryHost: 'https://us.posthog.com',
		posthogWebProjectId: '1',
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

describe('PostHogEndpointService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('retries 429 responses and returns the retried result', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(createMockResponse({ status: 429 }))
			.mockResolvedValueOnce(
				createMockResponse({
					status: 200,
					body: {
						results: [[1, 2]],
					},
				}),
			);
		const warnSpy = vi
			.spyOn(Logger.prototype, 'warn')
			.mockImplementation(() => undefined);

		vi.stubGlobal('fetch', fetchMock);

		const service = new PostHogEndpointService();
		const resultPromise = service.runEndpoint(
			'app_kpi_metrics_7d',
			'test.endpoint',
		);

		await Promise.resolve();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				'PostHog 429 for test.endpoint, retrying in 1000ms',
			),
		);

		await vi.advanceTimersByTimeAsync(1000);

		await expect(resultPromise).resolves.toEqual([[1, 2]]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenLastCalledWith(
			'https://us.posthog.com/api/projects/1/endpoints/app_kpi_metrics_7d/run',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer phe_test',
				}),
			}),
		);
	});
});
