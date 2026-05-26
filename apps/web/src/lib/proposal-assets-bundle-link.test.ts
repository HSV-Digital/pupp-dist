import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProposalAssetsBundleLink } from '@/lib/proposal-assets-bundle-link';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api-client', () => ({
	cspPartnerPublicApiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('createProposalAssetsBundleLink', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns parsed download URL payload on success', async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				url: '/api/email/proposal-assets/download?dlToken=abc',
				expiresAt: '2026-02-23T00:00:00.000Z',
			}),
		} as Response);

		const result = await createProposalAssetsBundleLink({
			mode: 'consolidated',
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			fileName: 'contoso-consolidated-proposals.pptx',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6000,
				},
			],
			currency: 'EUR',
		});

		expect(mockApiFetch).toHaveBeenCalledTimes(1);
		const [, init] = mockApiFetch.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toMatchObject({ currency: 'EUR' });
		expect(result).toEqual({
			url: '/csp-partners/api/email/proposal-assets/download?dlToken=abc',
			expiresAt: '2026-02-23T00:00:00.000Z',
		});
	});

	it('throws API error message when backend returns non-OK', async () => {
		mockApiFetch.mockResolvedValue({
			ok: false,
			json: async () => ({
				message: 'No valid proposal scenario',
			}),
		} as Response);

		await expect(
			createProposalAssetsBundleLink({
				mode: 'consolidated',
				journey: 'renewal',
				customerId: 'cust-1',
				customerName: 'Contoso',
				fileName: 'contoso-consolidated-proposals.pptx',
				scenarios: [
					{
						opportunityId: 'opp-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bp_cb',
						selectedSeats: 35,
						originalSeats: 40,
						expiringArr: 6000,
					},
				],
			}),
		).rejects.toThrow('No valid proposal scenario');
	});
});
