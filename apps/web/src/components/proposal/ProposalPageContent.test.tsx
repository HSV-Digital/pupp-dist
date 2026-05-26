import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SeatRange, SkuCategory } from '@repo/types';
import type { RenewalSubscription } from '@repo/types';
import type * as ScenarioSelectionModule from '@/lib/use-scenario-selection';
import { ProposalPageContent } from './ProposalPageContent';

class MockIntersectionObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

const pushMock = vi.fn();
const useScenarioSelectionMock = vi.fn();
const clearSelectionsMock = vi.fn();
const selectScenarioMock = vi.fn();
const deselectScenarioMock = vi.fn();
const updateSeatsMock = vi.fn();
const updateCurrentSkuCustomerPriceMock = vi.fn();
const updateCurrentSkuResellerPriceMock = vi.fn();
const resetSeatsMock = vi.fn();
const updateTargetSkuCustomerPriceMock = vi.fn();
const updateTargetSkuResellerPriceMock = vi.fn();
const updateExpiringSkuRenewalPriceMock = updateCurrentSkuCustomerPriceMock;
const updateTargetSkuPriceMock = updateTargetSkuCustomerPriceMock;
const updateTargetSkuMarginPercentMock = updateTargetSkuResellerPriceMock;
const createProposalOptionsEmailLinkMock = vi.fn();
const captureElementByIdAsPngBlobMock = vi.fn();

vi.mock('next/navigation', () => ({
	useRouter: () => ({ push: pushMock }),
	useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/lib/use-scenario-selection', async (importOriginal) => {
	const actual = (await importOriginal()) as typeof ScenarioSelectionModule;
	return {
		...actual,
		useScenarioSelection: () => {
			const value = useScenarioSelectionMock() as Record<string, unknown>;
			const getSelectionsForOpportunity =
				typeof value?.getSelectionsForOpportunity === 'function'
					? (value.getSelectionsForOpportunity as (
							opportunityId: string,
						) => unknown[])
					: (opportunityId: string) =>
							value?.selections instanceof Map
								? Array.from(value.selections.values()).filter(
										(selection) =>
											typeof selection === 'object' &&
											selection !== null &&
											'opportunityId' in selection &&
											selection.opportunityId === opportunityId,
									)
								: [];
			return {
				...value,
				getSelectionsForOpportunity,
				updateCurrentSkuCustomerPrice:
					typeof value?.updateCurrentSkuCustomerPrice === 'function'
						? value.updateCurrentSkuCustomerPrice
						: value?.updateExpiringSkuRenewalPrice,
				updateCurrentSkuResellerPrice:
					typeof value?.updateCurrentSkuResellerPrice === 'function'
						? value.updateCurrentSkuResellerPrice
						: vi.fn(),
				updateTargetSkuCustomerPrice:
					typeof value?.updateTargetSkuCustomerPrice === 'function'
						? value.updateTargetSkuCustomerPrice
						: value?.updateTargetSkuPrice,
				updateTargetSkuResellerPrice:
					typeof value?.updateTargetSkuResellerPrice === 'function'
						? value.updateTargetSkuResellerPrice
						: vi.fn(),
				getSharedRenewalPriceForOpportunity:
					typeof value?.getSharedRenewalPriceForOpportunity === 'function'
						? value.getSharedRenewalPriceForOpportunity
						: (opportunityId: string) => {
								const selections = getSelectionsForOpportunity(
									opportunityId,
								) as Array<{
									expiringSkuRenewalPrice?: number;
								}>;
								return selections.find(
									(selection) =>
										typeof selection.expiringSkuRenewalPrice === 'number',
								)?.expiringSkuRenewalPrice;
							},
			};
		},
	};
});

vi.mock('@/lib/proposal-options-email-link', () => ({
	createProposalOptionsEmailLink: (...args: unknown[]) =>
		createProposalOptionsEmailLinkMock(...args),
	createProposalOptionsEmailLinkPublic: (...args: unknown[]) =>
		createProposalOptionsEmailLinkMock(...args),
}));

vi.mock('@/lib/element-screenshot', () => ({
	captureElementByIdAsPngBlob: (...args: unknown[]) =>
		captureElementByIdAsPngBlobMock(...args),
}));

function makeSubscription(
	overrides: Partial<RenewalSubscription> = {},
): RenewalSubscription {
	return {
		customerId: 'cust-1',
		subscriptionId: 'sub-1',
		customerName: 'Contoso',
		resellerName: 'Reseller A',
		distributorName: 'Distributor A',
		pssAIWorkforceName: 'PSS A',
		pssAISecurityName: '',
		psaName: '',
		pdmName: 'PDM A',
		pmmName: 'PMM A',
		currentProduct: 'Microsoft 365 Business Standard',
		skuCategory: SkuCategory.Standard,
		seatCount: 40,
		annualRevenueRunRate: 6000,
		renewalDate: '2026-12-01',
		termMonths: 12,
		autoRenew: true,
		multiYear: false,
		hasCopilot: false,
		hasPurview: false,
		hasSureStep: false,
		currentMargin: 10,
		customerSegment: '',
		region: '',
		notes: '',
		...overrides,
	};
}

function makeMaskedSubscription(
	overrides: Partial<RenewalSubscription> = {},
): RenewalSubscription & {
	seatRange: SeatRange;
	closestRenewalLabel: string;
} {
	return {
		...makeSubscription(overrides),
		seatRange: SeatRange.Seats25To49,
		closestRenewalLabel: 'December 2026',
	};
}

const defaultProps = {
	customerId: 'cust-1',
	customerName: 'Contoso',
	backHref: '/dashboard',
	assetsBasePath: '/dashboard/proposal/cust-1/assets',
};

beforeEach(() => {
	pushMock.mockReset();
	clearSelectionsMock.mockReset();
	selectScenarioMock.mockReset();
	deselectScenarioMock.mockReset();
	updateSeatsMock.mockReset();
	updateCurrentSkuCustomerPriceMock.mockReset();
	updateCurrentSkuResellerPriceMock.mockReset();
	resetSeatsMock.mockReset();
	updateTargetSkuCustomerPriceMock.mockReset();
	updateTargetSkuResellerPriceMock.mockReset();
	createProposalOptionsEmailLinkMock.mockReset();
	captureElementByIdAsPngBlobMock.mockReset();

	useScenarioSelectionMock.mockReturnValue({
		hydrated: true,
		selections: new Map(),
		selectedCount: 0,
		hasSelections: false,
		getSelection: () => undefined,
		selectScenario: selectScenarioMock,
		deselectScenario: deselectScenarioMock,
		updateSeats: updateSeatsMock,
		updateCurrentSkuCustomerPrice: updateCurrentSkuCustomerPriceMock,
		updateCurrentSkuResellerPrice: updateCurrentSkuResellerPriceMock,
		resetSeats: resetSeatsMock,
		updateTargetSkuCustomerPrice: updateTargetSkuCustomerPriceMock,
		updateTargetSkuResellerPrice: updateTargetSkuResellerPriceMock,
		clearSelections: clearSelectionsMock,
	});

	createProposalOptionsEmailLinkMock.mockResolvedValue({
		url: 'https://example.com/download.docx',
		expiresAt: '2026-02-22T00:10:00.000Z',
	});
	captureElementByIdAsPngBlobMock.mockResolvedValue(
		new Blob(['png'], { type: 'image/png' }),
	);
});

describe('ProposalPageContent', () => {
	it('shows explicit empty state when customer has no supported opportunities', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[
					makeSubscription({
						currentProduct: 'Microsoft 365 E3',
						skuCategory: SkuCategory.E3,
					}),
				]}
			/>,
		);

		expect(
			screen.getByText('No eligible upgrade opportunities'),
		).toBeInTheDocument();
	});

	it('shows the assumed seats helper text for masked opportunity subscriptions', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeMaskedSubscription()]}
			/>,
		);

		expect(
			screen.getByText(
				'Select one or more options to generate the proposal',
			),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				'Assumed seats 25. Select an option to change the number of seats',
			),
		).toBeInTheDocument();
	});

	it('hides the assumed seats helper text for unmasked subscriptions', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);

		expect(
			screen.queryByText(/Assumed seats \d+\./),
		).not.toBeInTheDocument();
	});

	it('disables Generate Proposal button when no scenarios are selected', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);
		expect(
			screen.getByRole('button', { name: 'Generate Proposal' }),
		).toBeDisabled();
	});

	it('enables Generate Proposal button when at least one scenario is selected', () => {
		useScenarioSelectionMock.mockReturnValue({
			hydrated: true,
			selections: new Map([
				[
					'cust-1:sub-1',
					{
						opportunityId: 'cust-1:sub-1',
						startingSkuId: 'bs',
						endingSkuId: 'bs_cb',
						seats: 30,
					},
				],
			]),
			selectedCount: 1,
			hasSelections: true,
			getSelection: () => ({
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bs_cb',
				seats: 30,
			}),
			selectScenario: vi.fn(),
			deselectScenario: vi.fn(),
			updateSeats: vi.fn(),
			updateExpiringSkuRenewalPrice: vi.fn(),
			resetSeats: vi.fn(),
			updateTargetSkuPrice: vi.fn(),
			updateTargetSkuMarginPercent: vi.fn(),
			clearSelections: vi.fn(),
		});

		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);
		expect(
			screen.getByRole('button', { name: 'Generate Proposal' }),
		).toBeEnabled();
	});

	it('shows distributed start seats with dot separator in selected cards', () => {
		const firstSelection = {
			opportunityId: 'cust-1:sub-1',
			startingSkuId: 'bs',
			endingSkuId: 'bs_cb',
			seats: 30,
			expiringSkuRenewalPrice: 15,
		};
		const secondSelection = {
			opportunityId: 'cust-1:sub-1',
			startingSkuId: 'bs',
			endingSkuId: 'bp_cb',
			seats: 10,
		};
		useScenarioSelectionMock.mockReturnValue({
			hydrated: true,
			selections: new Map([
				['cust-1:sub-1::bs_cb', firstSelection],
				['cust-1:sub-1::bp_cb', secondSelection],
			]),
			selectedCount: 2,
			hasSelections: true,
			getSelection: (_opportunityId: string, endingSkuId: string) => {
				if (endingSkuId === firstSelection.endingSkuId) return firstSelection;
				if (endingSkuId === secondSelection.endingSkuId) return secondSelection;
				return undefined;
			},
			getSelectionsForOpportunity: (opportunityId: string) =>
				opportunityId === 'cust-1:sub-1'
					? [firstSelection, secondSelection]
					: [],
			selectScenario: vi.fn(),
			deselectScenario: vi.fn(),
			updateSeats: vi.fn(),
			updateExpiringSkuRenewalPrice: vi.fn(),
			resetSeats: vi.fn(),
			clearSelections: vi.fn(),
		});

		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription({ seatCount: 40 })]}
			/>,
		);

		expect(
			screen.getAllByText((_, node) => {
				const text = node?.textContent ?? '';
				return /From:\s*Business Standard\s*·\s*30 seats/.test(text);
			}).length,
		).toBeGreaterThan(0);
		expect(
			screen.getAllByText((_, node) => {
				const text = node?.textContent ?? '';
				return /From:\s*Business Standard\s*·\s*10 seats/.test(text);
			}).length,
		).toBeGreaterThan(0);
	});

	it('hides current sku margin input even when a scenario is selected', () => {
		useScenarioSelectionMock.mockReturnValue({
			hydrated: true,
			selections: new Map([
				[
					'cust-1:sub-1',
					{
						opportunityId: 'cust-1:sub-1',
						startingSkuId: 'bs',
						endingSkuId: 'bs_cb',
						seats: 40,
					},
				],
			]),
			selectedCount: 1,
			hasSelections: true,
			getSelection: (_opportunityId: string, endingSkuId: string) =>
				endingSkuId === 'bs_cb'
					? {
							opportunityId: 'cust-1:sub-1',
							startingSkuId: 'bs',
							endingSkuId: 'bs_cb',
							seats: 40,
						}
					: undefined,
			selectScenario: vi.fn(),
			deselectScenario: vi.fn(),
			updateSeats: vi.fn(),
			resetSeats: vi.fn(),
			updateTargetSkuPrice: vi.fn(),
			updateTargetSkuMarginPercent: vi.fn(),
			clearSelections: vi.fn(),
		});

		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);

		expect(
			screen.queryByLabelText('Current SKU Margin (%)'),
		).not.toBeInTheDocument();
	});

	it('uses editable target sku cost for calculations while keeping hero pricing unchanged', () => {
		useScenarioSelectionMock.mockReturnValue({
			hydrated: true,
			selections: new Map([
				[
					'cust-1:sub-1',
					{
						opportunityId: 'cust-1:sub-1',
						startingSkuId: 'bs',
						endingSkuId: 'bs_cb',
						seats: 40,
					},
				],
			]),
			selectedCount: 1,
			hasSelections: true,
			getSelection: (_opportunityId: string, endingSkuId: string) =>
				endingSkuId === 'bs_cb'
					? {
							opportunityId: 'cust-1:sub-1',
							startingSkuId: 'bs',
							endingSkuId: 'bs_cb',
							seats: 40,
						}
					: undefined,
			selectScenario: vi.fn(),
			deselectScenario: vi.fn(),
			updateSeats: vi.fn(),
			resetSeats: vi.fn(),
			updateTargetSkuPrice: vi.fn(),
			updateTargetSkuMarginPercent: vi.fn(),
			clearSelections: vi.fn(),
		});

		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);

		const targetPriceInput = screen.getByLabelText(
			'Target SKU cost to Customer',
		) as HTMLInputElement;
		expect(targetPriceInput.value).toBe('22');

		fireEvent.change(targetPriceInput, { target: { value: '25.5' } });

		expect(screen.getByText('Target SKU cost to Customer')).toBeInTheDocument();
		expect(screen.getByText('Target SKU cost to Reseller')).toBeInTheDocument();
		expect(screen.getAllByText('$22').length).toBeGreaterThan(0);
		expect(screen.getAllByText('$32').length).toBeGreaterThan(0);
		expect(screen.queryByText('$25.50')).not.toBeInTheDocument();
	});

	it('updates target customer and reseller prices for the selected ending sku only', () => {
		useScenarioSelectionMock.mockReturnValue({
			hydrated: true,
			selections: new Map([
				[
					'cust-1:sub-1::bs_cb',
					{
						opportunityId: 'cust-1:sub-1',
						startingSkuId: 'bs',
						endingSkuId: 'bs_cb',
						seats: 40,
						targetSkuCustomerPrice: 22,
						targetSkuResellerPrice: 17.6,
					},
				],
			]),
			selectedCount: 1,
			hasSelections: true,
			getSelection: (_opportunityId: string, endingSkuId: string) =>
				endingSkuId === 'bs_cb'
					? {
							opportunityId: 'cust-1:sub-1',
							startingSkuId: 'bs',
							endingSkuId: 'bs_cb',
							seats: 40,
							targetSkuCustomerPrice: 22,
							targetSkuResellerPrice: 17.6,
						}
					: undefined,
			getSelectionsForOpportunity: () => [
				{
					opportunityId: 'cust-1:sub-1',
					startingSkuId: 'bs',
					endingSkuId: 'bs_cb',
					seats: 40,
					targetSkuCustomerPrice: 22,
					targetSkuResellerPrice: 17.6,
				},
			],
			selectScenario: vi.fn(),
			deselectScenario: vi.fn(),
			updateSeats: vi.fn(),
			updateCurrentSkuCustomerPrice: vi.fn(),
			updateCurrentSkuResellerPrice: vi.fn(),
			resetSeats: vi.fn(),
			updateTargetSkuCustomerPrice: updateTargetSkuCustomerPriceMock,
			updateTargetSkuResellerPrice: updateTargetSkuResellerPriceMock,
			clearSelections: vi.fn(),
		});

		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);

		fireEvent.change(screen.getByLabelText('Target SKU cost to Customer'), {
			target: { value: '25.5' },
		});
		fireEvent.change(screen.getByLabelText('Target SKU cost to Reseller'), {
			target: { value: '17.25' },
		});

		expect(updateTargetSkuCustomerPriceMock).toHaveBeenCalledWith(
			'cust-1:sub-1',
			'bs_cb',
			25.5,
		);
		expect(updateTargetSkuResellerPriceMock).toHaveBeenCalledWith(
			'cust-1:sub-1',
			'bs_cb',
			17.25,
		);
	});

	it('keeps the default current sku customer price frozen when selected seats change', () => {
		let selection = {
			opportunityId: 'cust-1:sub-1',
			startingSkuId: 'bs',
			endingSkuId: 'bs_cb',
			seats: 40,
		};
		useScenarioSelectionMock.mockImplementation(() => ({
			hydrated: true,
			selections: new Map([['cust-1:sub-1::bs_cb', selection]]),
			selectedCount: 1,
			hasSelections: true,
			getSelection: (_opportunityId: string, endingSkuId: string) =>
				endingSkuId === selection.endingSkuId ? selection : undefined,
			getSelectionsForOpportunity: (opportunityId: string) =>
				opportunityId === selection.opportunityId ? [selection] : [],
			selectScenario: vi.fn(),
			deselectScenario: vi.fn(),
			updateSeats: updateSeatsMock,
			updateCurrentSkuCustomerPrice: updateCurrentSkuCustomerPriceMock,
			updateCurrentSkuResellerPrice: updateCurrentSkuResellerPriceMock,
			resetSeats: resetSeatsMock,
			updateTargetSkuCustomerPrice: updateTargetSkuCustomerPriceMock,
			updateTargetSkuResellerPrice: updateTargetSkuResellerPriceMock,
			clearSelections: clearSelectionsMock,
		}));

		const { rerender } = render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[
					makeSubscription({ seatCount: 40, annualRevenueRunRate: 6000 }),
				]}
			/>,
		);

		expect(
			(
				screen.getByLabelText(
					/Current SKU cost to Customer/i,
				) as HTMLInputElement
			).value,
		).toBe('12.5');

		selection = { ...selection, seats: 20 };
		rerender(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[
					makeSubscription({ seatCount: 40, annualRevenueRunRate: 6000 }),
				]}
			/>,
		);

		expect(
			(
				screen.getByLabelText(
					/Current SKU cost to Customer/i,
				) as HTMLInputElement
			).value,
		).toBe('12.5');
	});

	it('keeps a manually edited current sku customer price frozen when selected seats change', () => {
		let selection = {
			opportunityId: 'cust-1:sub-1',
			startingSkuId: 'bs',
			endingSkuId: 'bs_cb',
			seats: 40,
			currentSkuCustomerPrice: 15,
		};
		useScenarioSelectionMock.mockImplementation(() => ({
			hydrated: true,
			selections: new Map([['cust-1:sub-1::bs_cb', selection]]),
			selectedCount: 1,
			hasSelections: true,
			getSelection: (_opportunityId: string, endingSkuId: string) =>
				endingSkuId === selection.endingSkuId ? selection : undefined,
			getSelectionsForOpportunity: (opportunityId: string) =>
				opportunityId === selection.opportunityId ? [selection] : [],
			selectScenario: vi.fn(),
			deselectScenario: vi.fn(),
			updateSeats: updateSeatsMock,
			updateCurrentSkuCustomerPrice: updateCurrentSkuCustomerPriceMock,
			updateCurrentSkuResellerPrice: updateCurrentSkuResellerPriceMock,
			resetSeats: resetSeatsMock,
			updateTargetSkuCustomerPrice: updateTargetSkuCustomerPriceMock,
			updateTargetSkuResellerPrice: updateTargetSkuResellerPriceMock,
			clearSelections: clearSelectionsMock,
		}));

		const { rerender } = render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[
					makeSubscription({ seatCount: 40, annualRevenueRunRate: 6000 }),
				]}
			/>,
		);

		expect(
			(
				screen.getByLabelText(
					/Current SKU cost to Customer/i,
				) as HTMLInputElement
			).value,
		).toBe('15');

		selection = { ...selection, seats: 20 };
		rerender(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[
					makeSubscription({ seatCount: 40, annualRevenueRunRate: 6000 }),
				]}
			/>,
		);

		expect(
			(
				screen.getByLabelText(
					/Current SKU cost to Customer/i,
				) as HTMLInputElement
			).value,
		).toBe('15');
	});

	it('renders vertical opportunity tabs with subscription summary', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);

		expect(screen.getByTestId('opportunity-panel')).toBeInTheDocument();
		expect(screen.getByRole('tablist')).toBeInTheDocument();
		expect(
			screen.getByText('Microsoft 365 Business Standard'),
		).toBeInTheDocument();
		expect(
			screen.getByRole('tab', {
				name: /Seats 25-49 · December 2026/i,
			}),
		).toBeInTheDocument();

		const scenarioBackground = screen.getByTestId('proposal-background');
		expect(scenarioBackground.className).not.toContain('panel');
	});

	it('defaults to All Options and shows both AI and Security scenarios', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);

		expect(screen.getByRole('button', { name: 'All Options' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(
			screen.getByText('Business Standard + Copilot Business'),
		).toBeInTheDocument();
		expect(
			screen.getByText('Business Premium + Defender Suite'),
		).toBeInTheDocument();
	});

	it('filters to AI Attach and keeps existing selections', () => {
		useScenarioSelectionMock.mockReturnValue({
			hydrated: true,
			selections: new Map([
				[
					'cust-1:sub-1',
					{
						opportunityId: 'cust-1:sub-1',
						startingSkuId: 'bs',
						endingSkuId: 'bp_defender',
						seats: 30,
					},
				],
			]),
			selectedCount: 1,
			hasSelections: true,
			getSelection: () => ({
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs',
				endingSkuId: 'bp_defender',
				seats: 30,
			}),
			selectScenario: vi.fn(),
			deselectScenario: vi.fn(),
			updateSeats: vi.fn(),
			resetSeats: vi.fn(),
			updateTargetSkuPrice: vi.fn(),
			updateTargetSkuMarginPercent: vi.fn(),
			clearSelections: clearSelectionsMock,
		});

		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'AI Attach' }));

		expect(clearSelectionsMock).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'AI Attach' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		expect(
			screen.getByText('Business Standard + Copilot Business'),
		).toBeInTheDocument();
		const cardsRow = screen.getByTestId('scenario-cards-row');
		expect(
			within(cardsRow).queryByText('Business Premium + Defender Suite'),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'Generate Proposal' }),
		).toBeEnabled();
	});

	it('filters to Security Options and hides AI scenarios', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[makeSubscription()]}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'Security option' }));

		expect(
			screen.getByText('Business Premium + Defender Suite'),
		).toBeInTheDocument();
		expect(
			screen.queryByText('Business Standard + Copilot Business'),
		).not.toBeInTheDocument();
	});

	it('shows empty state for unsupported starting SKUs', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				subscriptions={[
					makeSubscription({
						currentProduct: 'M365 Apps for Business',
						skuCategory: SkuCategory.Other,
					}),
				]}
			/>,
		);

		expect(
			screen.getByText('No eligible upgrade opportunities'),
		).toBeInTheDocument();
		expect(
			screen.getByText(/none map to supported starting SKUs/i),
		).toBeInTheDocument();
	});

	it('navigates to backHref when "Back to Dashboard" is clicked in empty state', () => {
		render(
			<ProposalPageContent
				{...defaultProps}
				backHref="/csp-partners"
				subscriptions={[
					makeSubscription({
						currentProduct: 'Microsoft 365 E3',
						skuCategory: SkuCategory.E3,
					}),
				]}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Back to Dashboard' }));
		expect(pushMock).toHaveBeenCalledWith('/csp-partners');
	});
});
