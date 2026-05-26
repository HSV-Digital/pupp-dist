import {
	Injectable,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common';
import { getEnv } from '../config/env';

interface EndpointApiResponse {
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
export class PostHogEndpointService {
	private readonly logger = new Logger(PostHogEndpointService.name);
	private readonly env = getEnv();

	get isConfigured(): boolean {
		return (
			this.env.posthogEndpointApiKey.trim().length > 0 &&
			this.env.posthogWebProjectId.trim().length > 0
		);
	}

	async runEndpoint<T = unknown>(
		endpointName: string,
		label?: string,
	): Promise<T[]> {
		if (!this.isConfigured) {
			throw new InternalServerErrorException(
				'PostHog Endpoint API is not configured for admin activity analytics',
			);
		}

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			const response = await fetch(
				`${this.env.posthogQueryHost}/api/projects/${this.env.posthogWebProjectId}/endpoints/${endpointName}/run`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${this.env.posthogEndpointApiKey}`,
					},
					body: JSON.stringify({}),
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
					`PostHog ${response.status} for ${label ?? endpointName}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
				);
				await sleep(delayMs);
				continue;
			}

			if (!response.ok) {
				const message = await response.text();
				this.logger.error(
					`PostHog Endpoint API request failed${label ? ` for ${label}` : ''} with ${response.status}: ${message}`,
				);
				throw new InternalServerErrorException(
					'Failed to query PostHog endpoint data',
				);
			}

			const payload = (await response.json()) as EndpointApiResponse;
			return mapEndpointResults<T>(payload);
		}

		throw new InternalServerErrorException(
			`PostHog endpoint exhausted retries${label ? ` for ${label}` : ''}`,
		);
	}
}

function mapEndpointResults<T>(payload: EndpointApiResponse): T[] {
	if (!Array.isArray(payload.results) || payload.results.length === 0) {
		return [];
	}

	const [firstRow] = payload.results;
	if (firstRow && !Array.isArray(firstRow)) {
		return payload.results as T[];
	}

	if (!Array.isArray(payload.columns)) {
		return payload.results as T[];
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
