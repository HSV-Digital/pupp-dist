import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/health', () => {
	it('returns a partner-safe health payload', async () => {
		const response = await GET();
		const payload = (await response.json()) as {
			status: string;
			service: string;
			timestamp: string;
		};

		expect(response.status).toBe(200);
		expect(payload.status).toBe('ok');
		expect(payload.service).toBe('web');
		expect(new Date(payload.timestamp).toString()).not.toBe('Invalid Date');
	});
});
