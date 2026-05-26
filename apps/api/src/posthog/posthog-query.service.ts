import {
	Injectable,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common';
import { getEnv } from '../config/env';

interface QueryApiResponse {
	columns?: string[];
	results?: unknown[];
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const GATEWAY_TIMEOUT_BASE_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class PostHogQueryService {
	private readonly logger = new Logger(PostHogQueryService.name);
	private readonly env = getEnv();

	get isConfigured(): boolean {
		return (
			this.env.posthogPersonalApiKey.trim().length > 0 &&
			this.env.posthogWebProjectId.trim().length > 0
		);
	}

	async runHogQL<T extends Record<string, unknown>>(
		query: string,
		queryLabel?: string,
	): Promise<T[]> {
		if (!this.isConfigured) {
			throw new InternalServerErrorException(
				'PostHog Query API is not configured for admin activity analytics',
			);
		}

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			const response = await fetch(
				`${this.env.posthogQueryHost}/api/projects/${this.env.posthogWebProjectId}/query/`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${this.env.posthogPersonalApiKey}`,
					},
					body: JSON.stringify({
						query: {
							kind: 'HogQLQuery',
							query,
						},
					}),
				},
			);

			if (
				(response.status === 429 || response.status === 504) &&
				attempt < MAX_RETRIES
			) {
				const retryAfter = response.headers.get('retry-after');
				const baseDelayMs =
					response.status === 504
						? GATEWAY_TIMEOUT_BASE_DELAY_MS
						: BASE_DELAY_MS;
				const parsedRetryAfterMs = retryAfter
					? parseInt(retryAfter, 10) * 1000
					: Number.NaN;
				const delayMs = Number.isFinite(parsedRetryAfterMs)
					? parsedRetryAfterMs
					: baseDelayMs * Math.pow(2, attempt);
				this.logger.warn(
					`PostHog ${response.status} for ${queryLabel ?? 'unknown'}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
				);
				await sleep(delayMs);
				continue;
			}

			if (!response.ok) {
				const message = await response.text();
				this.logger.error(
					`PostHog Query API request failed${queryLabel ? ` for ${queryLabel}` : ''} with ${response.status}: ${message}`,
				);
				throw new InternalServerErrorException(
					'Failed to query PostHog activity data',
				);
			}

			const payload = (await response.json()) as QueryApiResponse;
			return mapQueryResults<T>(payload);
		}

		throw new InternalServerErrorException(
			`PostHog query exhausted retries${queryLabel ? ` for ${queryLabel}` : ''}`,
		);
	}

	async runHogQLBatch(
		tasks: Array<{ query: string; label: string }>,
		concurrency = 2,
	): Promise<Record<string, unknown>[][]> {
		const results: Record<string, unknown>[][] = [];
		for (let i = 0; i < tasks.length; i += concurrency) {
			const chunk = tasks.slice(i, i + concurrency);
			const chunkResults = await Promise.all(
				chunk.map((task) => this.runHogQL(task.query, task.label)),
			);
			results.push(...chunkResults);
		}
		return results;
	}
}

function mapQueryResults<T extends Record<string, unknown>>(
	payload: QueryApiResponse,
): T[] {
	if (!Array.isArray(payload.results) || payload.results.length === 0) {
		return [];
	}

	const [firstRow] = payload.results;
	if (firstRow && !Array.isArray(firstRow)) {
		return payload.results as T[];
	}

	if (!Array.isArray(payload.columns)) {
		return [];
	}

	return payload.results.map((row) => {
		if (!Array.isArray(row)) {
			return row as T;
		}

		return Object.fromEntries(
			payload.columns!.map((column, index) => [column, row[index] ?? null]),
		) as T;
	});
}
