import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCustomerProposalEmailLink } from '@/lib/customer-proposal-email-link';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api-client', () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('createCustomerProposalEmailLink', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns parsed download URL payload on success', async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				url: 'https://example.com/download.docx',
				expiresAt: '2026-02-23T00:00:00.000Z',
			}),
		} as Response);

		const result = await createCustomerProposalEmailLink({
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bs_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6000,
				},
			],
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
				message: 'Template selection failed',
			}),
		} as Response);

		await expect(
			createCustomerProposalEmailLink({
				journey: 'new_customer',
				customerId: 'cust-1',
				customerName: 'Contoso',
				scenarios: [
					{
						opportunityId: 'opp-1',
						startingSkuId: 'other',
						startingSkuName: 'Other',
						endingSkuId: 'bp_cb',
						selectedSeats: 20,
						originalSeats: 20,
						expiringArr: 2000,
					},
				],
			}),
		).rejects.toThrow('Template selection failed');
	});
});
