import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioSelection } from '@repo/types';
import { AssetsPageContent } from './AssetsPageContent';

const replaceMock = vi.fn();
const fetchMock = vi.fn();
const assetsLeftColumnMock = vi.fn();

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
	useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/components/proposal/AssetsLeftColumn', () => ({
	AssetsLeftColumn: (props: {
		customerName: string;
		loading?: boolean;
		proposalDownloadUrl?: string | null;
		showConsolidatedPpt?: boolean;
		individualPpts?: Array<{ key: string; label: string }>;
	}) => {
		assetsLeftColumnMock(props);
		return (
			<div data-testid="assets-left-column">
				<p>Download and send the proactive proposal</p>
				<p>{props.customerName}</p>
				<p data-testid="left-loading-state">
					{props.loading ? 'loading' : 'ready'}
				</p>
				<p data-testid="left-proposal-download-url">
					{props.proposalDownloadUrl ?? 'none'}
				</p>
				<p data-testid="left-line-item-count">
					{props.individualPpts?.length ?? 0}
				</p>
				<p data-testid="left-show-consolidated">
					{props.showConsolidatedPpt ? 'yes' : 'no'}
				</p>
			</div>
		);
	},
}));

function writeSelections(selections: ScenarioSelection[]) {
	const payload = {
		version: 4,
		entries: selections.map((selection) => [
			`${selection.opportunityId}::${selection.endingSkuId}`,
			selection,
		]),
	};
	window.sessionStorage.setItem(
		'scenario-selections:cust-1',
		JSON.stringify(payload),
	);
}

const defaultProps = {
	customerId: 'cust-1',
	backHref: '/dashboard/proposal/cust-1',
	proposalBasePath: '/dashboard/proposal/cust-1',
	isNewCustomer: false,
	loadRequest: {
		kind: 'public' as const,
		customerSnapshot: {
			customerId: 'cust-1',
			customerName: 'Contoso',
			subscriptions: [],
		},
	},
};

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	replaceMock.mockReset();
	fetchMock.mockReset();
	assetsLeftColumnMock.mockReset();
	window.sessionStorage.clear();

	fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
		const url = String(input);
		if (url.endsWith('/api/email/proposal-assets/load-public')) {
			return {
				ok: true,
				json: async () => ({
					customer: {
						customerId: 'cust-1',
						customerName: 'Contoso',
					},
					selectedScenarios: [
						{
							opportunityId: 'cust-1:sub-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb_purview',
							selectedSeats: 150,
							originalSeats: 160,
							expiringArr: 6000,
						},
					],
					summary: {
						currentAnnual: 6000,
						listAnnual: 9000,
						offerAnnual: 8100,
						promoSavings: 900,
						incrementalCost: 2100,
						incrementalIncentive: 300,
					},
					pricingContext: {
						region: null,
						country: 'US',
						currency: 'USD',
						currencySymbol: '$',
						locale: 'en-US',
						fallbackApplied: false,
						fallbackReason: 'none',
					},
					assets: {
						consolidated: null,
						lineItems: [
							{
								opportunityId: 'cust-1:sub-1',
								endingSkuId: 'bp_cb_purview',
								selectedSeats: 150,
								label:
									'Proposal Document - BS to BP + CB + Purview Suite - 150 Seats',
								fileName:
									'proposal_document_bs_to_bp_cb_purview_suite_150_seats.pptx',
								status: 'not_generated',
							},
						],
						bundleDownloadUrl:
							'/api/email/proposal-assets/download?dlToken=assets-token',
						uploadedAt: '2026-02-23T00:00:00.000Z',
					},
				}),
			} as unknown as Response;
		}

		if (url.endsWith('/api/email/proposal-assets/line-item/generate-public')) {
			return {
				ok: true,
				json: async () => ({
					opportunityId: 'cust-1:sub-1',
					endingSkuId: 'bp_cb_purview',
					selectedSeats: 150,
					label:
						'Proposal Document - BS to BP + CB + Purview Suite - 150 Seats',
					fileName:
						'proposal_document_bs_to_bp_cb_purview_suite_150_seats.pptx',
					blobUrl: 'https://blob.example.com/sub-1.pptx',
					uploadedAt: '2026-02-23T00:00:00.000Z',
				}),
			} as unknown as Response;
		}

		return {
			ok: true,
			json: async () => ({}),
		} as unknown as Response;
	});

	vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('AssetsPageContent', () => {
	it('redirects back when no valid selections exist', async () => {
		render(<AssetsPageContent {...defaultProps} />);
		await act(() => vi.advanceTimersByTimeAsync(800));

		await waitFor(() =>
			expect(replaceMock).toHaveBeenCalledWith(
				'/dashboard/proposal/cust-1?reason=missing-selections',
			),
		);
	});

	it('hides consolidated preview when there is a single opportunity', async () => {
		writeSelections([
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_cb_purview',
				seats: 150,
			},
		]);

		render(<AssetsPageContent {...defaultProps} />);
		await act(() => vi.advanceTimersByTimeAsync(800));

		await waitFor(() =>
			expect(
				screen.getByText(
					'Proposal Document - BS to BP + CB + Purview Suite - 150 Seats',
				),
			).toBeInTheDocument(),
		);
		expect(screen.getByText('1 of 1')).toBeInTheDocument();
		expect(screen.getByTestId('left-line-item-count')).toHaveTextContent('1');
		expect(screen.getByTestId('left-loading-state')).toHaveTextContent('ready');
		expect(screen.getByTestId('left-show-consolidated')).toHaveTextContent(
			'no',
		);
	});

	it('passes loading state to left column during bootstrap', async () => {
		writeSelections([
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_cb_purview',
				seats: 150,
			},
		]);

		render(<AssetsPageContent {...defaultProps} />);
		expect(screen.getByTestId('left-loading-state')).toHaveTextContent(
			'loading',
		);
		await act(() => vi.advanceTimersByTimeAsync(800));

		await waitFor(() =>
			expect(screen.getByTestId('left-loading-state')).toHaveTextContent(
				'ready',
			),
		);
	});

	it('calls bootstrap load API only once after hydration', async () => {
		writeSelections([
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_cb_purview',
				seats: 150,
			},
		]);

		render(<AssetsPageContent {...defaultProps} />);
		await act(() => vi.advanceTimersByTimeAsync(800));

		await waitFor(() => {
			const loadCalls = fetchMock.mock.calls.filter((call) =>
				String(call[0]).endsWith('/api/email/proposal-assets/load-public'),
			);
			expect(loadCalls).toHaveLength(1);
		});
	});

	it('auto-loads the single line-item preview for renewal', async () => {
		writeSelections([
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_cb_purview',
				seats: 150,
			},
		]);

		render(<AssetsPageContent {...defaultProps} />);
		await act(() => vi.advanceTimersByTimeAsync(800));

		await waitFor(() =>
			expect(
				screen.getByText(
					'Proposal Document - BS to BP + CB + Purview Suite - 150 Seats',
				),
			).toBeInTheDocument(),
		);
		await waitFor(() =>
			expect(
				fetchMock.mock.calls.some((call) =>
					String(call[0]).endsWith(
						'/api/email/proposal-assets/line-item/generate-public',
					),
				),
			).toBe(true),
		);
		const generateCall = fetchMock.mock.calls.find((call) =>
			String(call[0]).endsWith(
				'/api/email/proposal-assets/line-item/generate-public',
			),
		);
		expect(generateCall).toBeDefined();
		const generateBody = JSON.parse(
			(generateCall?.[1] as RequestInit).body as string,
		);
		expect(generateBody.selectionContext).toEqual([
			{
				opportunityId: 'cust-1:sub-1',
				endingSkuId: 'bp_cb_purview',
				seats: 150,
			},
		]);
	});

	it('sends stored selections in the load request', async () => {
		writeSelections([
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_defender',
				seats: 30,
				expiringSkuRenewalPrice: 18.25,
				targetSkuPrice: 27.5,
				targetSkuMarginPercent: 21.75,
			},
		]);

		render(<AssetsPageContent {...defaultProps} />);
		await act(() => vi.advanceTimersByTimeAsync(800));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const loadCall = fetchMock.mock.calls.find((call) =>
			String(call[0]).endsWith('/api/email/proposal-assets/load-public'),
		);
		expect(loadCall).toBeDefined();
		const callBody = JSON.parse((loadCall?.[1] as RequestInit).body as string);
		expect(callBody.journey).toBe('renewal');
		expect(callBody.selections).toEqual([
			{
				opportunityId: 'cust-1:sub-1',
				endingSkuId: 'bp_defender',
				seats: 30,
				expiringSkuRenewalPrice: 18.25,
				targetSkuPrice: 27.5,
				targetSkuMarginPercent: 21.75,
			},
		]);
	});

	it('normalizes stored renewal price across selections from the same opportunity', async () => {
		writeSelections([
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_defender',
				seats: 30,
				currentSkuCustomerPrice: 18.25,
				expiringSkuRenewalPrice: 18.25,
			},
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_cb_purview',
				seats: 10,
				currentSkuCustomerPrice: 18.25,
				expiringSkuRenewalPrice: 18.25,
			},
		]);

		render(<AssetsPageContent {...defaultProps} />);
		await act(() => vi.advanceTimersByTimeAsync(800));

		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const loadCall = fetchMock.mock.calls.find((call) =>
			String(call[0]).endsWith('/api/email/proposal-assets/load-public'),
		);
		expect(loadCall).toBeDefined();
		const callBody = JSON.parse((loadCall?.[1] as RequestInit).body as string);
		expect(callBody.selections).toEqual([
			{
				opportunityId: 'cust-1:sub-1',
				endingSkuId: 'bp_defender',
				seats: 30,
				currentSkuCustomerPrice: 18.25,
				expiringSkuRenewalPrice: 18.25,
			},
			{
				opportunityId: 'cust-1:sub-1',
				endingSkuId: 'bp_cb_purview',
				seats: 10,
				currentSkuCustomerPrice: 18.25,
				expiringSkuRenewalPrice: 18.25,
			},
		]);
	});

	it('passes bundle download url to left column', async () => {
		writeSelections([
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_cb_purview',
				seats: 150,
			},
		]);

		render(<AssetsPageContent {...defaultProps} />);
		await act(() => vi.advanceTimersByTimeAsync(800));

		await waitFor(() =>
			expect(
				screen.getByTestId('left-proposal-download-url'),
			).toHaveTextContent(
				'/api/email/proposal-assets/download?dlToken=assets-token',
			),
		);
	});
});
