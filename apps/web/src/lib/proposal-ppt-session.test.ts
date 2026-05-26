import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProposalPptSession } from '@/lib/proposal-ppt-session';

const mockApiFetch = vi.fn();

vi.mock('@/lib/api-client', () => ({
	apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

describe('createProposalPptSession', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('returns parsed proposal ppt session payload on success', async () => {
		mockApiFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				token: 'ppt-token',
				renderUrl: '/api/email/proposal-ppt/render?dlToken=ppt-token',
				downloadUrl: '/api/email/proposal-ppt/download?dlToken=ppt-token',
				expiresAt: '2026-02-23T00:00:00.000Z',
			}),
		} as Response);

		const result = await createProposalPptSession({
			mode: 'single',
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			fileName: 'contoso-proposal.pptx',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
			currency: 'GBP',
		});

		expect(mockApiFetch).toHaveBeenCalledTimes(1);
		const [, init] = mockApiFetch.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toMatchObject({ currency: 'GBP' });
		expect(result).toEqual({
			token: 'ppt-token',
			renderUrl:
				'/csp-partners/api/email/proposal-ppt/render?dlToken=ppt-token',
			downloadUrl:
				'/csp-partners/api/email/proposal-ppt/download?dlToken=ppt-token',
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
			createProposalPptSession({
				mode: 'single',
				journey: 'renewal',
				customerId: 'cust-1',
				customerName: 'Contoso',
				fileName: 'contoso-proposal.pptx',
				scenarios: [
					{
						opportunityId: 'opp-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bp_cb',
						selectedSeats: 35,
						originalSeats: 40,
						expiringArr: 6_000,
					},
				],
			}),
		).rejects.toThrow('No valid proposal scenario');
	});
});
