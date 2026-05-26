import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpportunityListEmailLink } from '@/lib/opportunity-list-email-link';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api-client', () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('createOpportunityListEmailLink', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns parsed response payload on success', async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				url: 'https://example.com/download.docx',
				expiresAt: '2026-02-23T00:00:00.000Z',
			}),
		} as Response);

		const result = await createOpportunityListEmailLink({
			viewMode: 'reseller',
			resellerCount: 10,
			customerCount: 20,
			totalRenewals: 100,
			totalSeatsRange: '500-999',
			selectedSkuIds: ['bs_cb'],
		});

		expect(mockApiFetch).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			url: 'https://example.com/download.docx',
			expiresAt: '2026-02-23T00:00:00.000Z',
		});
	});

	it('throws API error message when backend returns non-OK', async () => {
		mockApiFetch.mockResolvedValue({
			ok: false,
			json: async () => ({
				message: 'Template not found',
			}),
		} as Response);

		await expect(
			createOpportunityListEmailLink({
				viewMode: 'reseller',
				resellerCount: 10,
				customerCount: 20,
				totalRenewals: 100,
				totalSeatsRange: '500-999',
				selectedSkuIds: ['bs_cb'],
			}),
		).rejects.toThrow('Template not found');
	});
});
