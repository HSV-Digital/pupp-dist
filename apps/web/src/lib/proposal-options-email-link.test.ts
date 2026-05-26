import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProposalOptionsEmailLink } from '@/lib/proposal-options-email-link';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api-client', () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('createProposalOptionsEmailLink', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns parsed download URL payload on success', async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				url: 'https://example.com/download.docx',
				expiresAt: '2026-02-22T00:10:00.000Z',
			}),
		} as Response);

		const result = await createProposalOptionsEmailLink({
			payload: {
				journey: 'renewal',
				filter: 'ai',
				customerId: 'cust-1',
				customerName: 'Contoso',
				opportunityId: 'opp-1',
				startingSkuId: 'bs',
				startingSkuName: 'Business Standard',
				seats: 40,
				expiringArr: 6000,
				renewalDate: '2026-12-01',
				selectedEndingSkuIds: ['bs_cb'],
			},
			screenshot: new Blob(['png'], { type: 'image/png' }),
		});

		expect(mockApiFetch).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			url: 'https://example.com/download.docx',
			expiresAt: '2026-02-22T00:10:00.000Z',
		});
	});

	it('throws a fallback error on network failure', async () => {
		mockApiFetch.mockRejectedValue(new Error('network down'));

		await expect(
			createProposalOptionsEmailLink({
				payload: {
					journey: 'renewal',
					filter: 'security',
					customerId: 'cust-1',
					customerName: 'Contoso',
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					seats: 40,
					expiringArr: 6000,
					selectedEndingSkuIds: ['bp_defender'],
				},
			}),
		).rejects.toThrow(
			'Unable to generate the proposal options email. Please try again.',
		);
	});

	it('throws when API response does not include a valid URL payload', async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				url: '',
				expiresAt: '',
			}),
		} as Response);

		await expect(
			createProposalOptionsEmailLink({
				payload: {
					journey: 'new_customer',
					filter: 'all',
					customerId: 'cust-1',
					customerName: 'Contoso',
					opportunityId: 'opp-1',
					startingSkuId: 'other',
					startingSkuName: 'Other',
					seats: 100,
					expiringArr: 12000,
					selectedEndingSkuIds: ['bp_cb'],
				},
			}),
		).rejects.toThrow(
			'Unable to generate the proposal options email. Please try again.',
		);
	});
});
