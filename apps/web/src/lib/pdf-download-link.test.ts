import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPdfListLink } from '@/lib/pdf-download-link';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api-client', () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('createPdfListLink', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	const request = {
		viewMode: 'reseller' as const,
		filters: {
			pssAIWorkforce: [],
			pssAISecurity: [],
			psa: [],
			distributor: [],
			reseller: [],
			customer: [],
			pdm: [],
			pmm: [],
			region: [],
			type: [],
			skuCategory: [],
			expSeats: [],
			renewalDate: [],
			pastRenewalDate: [],
			search: 'contoso',
		},
		sort: {
			sortBy: 'totalARR',
			sortDir: 'descending' as const,
		},
		selectedSkuIds: ['bp_cb'],
	};

	it('returns parsed response URL on success', async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				url: 'https://example.com/list.pdf',
			}),
		} as Response);

		const url = await createPdfListLink(request);

		expect(url).toBe('https://example.com/list.pdf');
	});

	it('throws API message when backend response is non-OK', async () => {
		mockApiFetch.mockResolvedValue({
			ok: false,
			json: async () => ({
				message: 'Invalid request payload',
			}),
		} as Response);

		await expect(createPdfListLink(request)).rejects.toThrow(
			'Invalid request payload',
		);
	});

	it('throws default error when response URL is missing', async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				nope: true,
			}),
		} as Response);

		await expect(createPdfListLink(request)).rejects.toThrow(
			'Unable to generate the PDF. Please try again.',
		);
	});
});
