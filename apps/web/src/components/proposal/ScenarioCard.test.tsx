import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SkuCategory, UpgradeType } from '@repo/types';
import {
	calculateScenario,
	deriveResellerPriceFromMargin,
	getDefaultTargetSkuMarginPercent,
} from '@/lib/rules-engine';
import type { CustomerOpportunity } from '@/lib/opportunity-utils';
import { DEFAULT_PARTNER_FILTERS } from '@/components/proposal/PartnerFilterPanel';
import type { PartnerFilters } from '@/components/proposal/PartnerFilterPanel';
import { ScenarioCard } from './ScenarioCard';

function makeOpportunity(): CustomerOpportunity {
	return {
		opportunityId: 'cust-1:sub-1',
		customerId: 'cust-1',
		subscriptionId: 'sub-1',
		subscription: {
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
			seatCount: 60,
			annualRevenueRunRate: 9000,
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
		},
		startingSku: {
			id: 'bs',
			name: 'Business Standard',
			monthlyPrice: 12.5,
		},
		endingSkus: [
			{
				id: 'bs_cb',
				name: 'Business Standard + Copilot Business',
				upgradeType: UpgradeType.AI,
				listPrice: 32,
				promoPrice: 22,
				description: 'AI productivity upgrade.',
				planHighlights: ['Copilot included'],
				tagline: 'tagline',
				oneLiner: 'one-liner',
				solutionCapabilities: ['capability'],
			},
		],
		proposalExpiringArr: 12_204,
		pricingContext: {
			country: 'CA',
			regionCountry: 'CA',
			currency: 'CAD',
			currencySymbol: 'CA$',
			locale: 'en-CA',
			sourceRegion: 'Canada',
			fallbackApplied: false,
			fallbackReason: 'none',
		},
	};
}

function renderScenarioCard(options?: {
	isSelected?: boolean;
	compact?: boolean;
	partnerFilters?: PartnerFilters;
	onToggle?: () => void;
	onSeatsChange?: (nextSeats: unknown) => void;
	onCurrentSkuCustomerPriceChange?: (price: number) => void;
	onCurrentSkuResellerPriceChange?: (price: number) => void;
	onTargetSkuCustomerPriceChange?: (price: number) => void;
	onTargetSkuResellerPriceChange?: (price: number) => void;
	endingSku?: CustomerOpportunity['endingSkus'][number];
	currentSkuCustomerPrice?: number;
	currentSkuResellerPrice?: number;
	targetSkuCustomerPrice?: number;
	targetSkuResellerPrice?: number;
	selectedSeats?: number;
	currentSeats?: number;
	maxAllowedSeats?: number;
	seatLimitTotal?: number;
}) {
	const opportunity = makeOpportunity();
	const endingSku = options?.endingSku ?? opportunity.endingSkus[0];
	const scenario = calculateScenario(opportunity.startingSku, endingSku, 60);
	const currentSkuCustomerPrice =
		options?.currentSkuCustomerPrice ?? scenario.currentAnnualValue / 60 / 12;
	const currentSkuResellerPrice =
		options?.currentSkuResellerPrice ??
		deriveResellerPriceFromMargin({
			customerPrice: currentSkuCustomerPrice,
			marginPercent: 20,
		});
	const targetSkuCustomerPrice =
		options?.targetSkuCustomerPrice ?? endingSku.promoPrice;
	const targetSkuResellerPrice =
		options?.targetSkuResellerPrice ??
		deriveResellerPriceFromMargin({
			customerPrice: targetSkuCustomerPrice,
			marginPercent: getDefaultTargetSkuMarginPercent(endingSku.id),
		});

	render(
		<ScenarioCard
			opportunity={opportunity}
			endingSku={endingSku}
			scenario={scenario}
			partnerFilters={options?.partnerFilters ?? DEFAULT_PARTNER_FILTERS}
			currentSkuCustomerPrice={currentSkuCustomerPrice}
			currentSkuResellerPrice={currentSkuResellerPrice}
			targetSkuCustomerPrice={targetSkuCustomerPrice}
			targetSkuResellerPrice={targetSkuResellerPrice}
			isSelected={options?.isSelected ?? false}
			selectedSeats={options?.selectedSeats ?? 60}
			currentSeats={options?.currentSeats ?? 60}
			maxAllowedSeats={options?.maxAllowedSeats ?? 300}
			seatLimitTotal={options?.seatLimitTotal ?? 300}
			onToggle={options?.onToggle ?? vi.fn()}
			onSeatsChange={options?.onSeatsChange ?? vi.fn()}
			onCurrentSkuCustomerPriceChange={
				options?.onCurrentSkuCustomerPriceChange ?? vi.fn()
			}
			onCurrentSkuResellerPriceChange={
				options?.onCurrentSkuResellerPriceChange ?? vi.fn()
			}
			onTargetSkuCustomerPriceChange={
				options?.onTargetSkuCustomerPriceChange ?? vi.fn()
			}
			onTargetSkuResellerPriceChange={
				options?.onTargetSkuResellerPriceChange ?? vi.fn()
			}
		/>,
	);

	return { opportunity, endingSku, scenario };
}

describe('ScenarioCard', () => {
	it('renders pricing and profitability values', () => {
		renderScenarioCard();

		expect(screen.getByText('CA$22')).toBeInTheDocument();
		expect(screen.getByText('CA$32')).toBeInTheDocument();
		expect(
			screen.getByText('Expiring SKU Renewal cost to Customer'),
		).toBeInTheDocument();
		expect(screen.getByText('CA$9,000.00')).toBeInTheDocument();
		expect(
			screen.getByText('Incremental Cost to Customer (Estimated)'),
		).toBeInTheDocument();
		expect(screen.getByText('Partner Profitability')).toBeInTheDocument();
		expect(screen.queryByText(/^Current SKU Margin/)).not.toBeInTheDocument();
		expect(screen.getByText(/^Target SKU Margin/)).toBeInTheDocument();
		expect(screen.getByText('Total Incentive and Margin')).toBeInTheDocument();
		expect(
			screen.getByText('Current Incentive and Margin'),
		).toBeInTheDocument();
		expect(
			screen.getByText('Incremental Incentive and Margin'),
		).toBeInTheDocument();
	});

	it('calls onToggle when card is clicked', () => {
		const onToggle = vi.fn();
		renderScenarioCard({ onToggle });

		fireEvent.click(screen.getByText('Business Standard + Copilot Business'));
		expect(onToggle).toHaveBeenCalled();
	});

	it('shows seat controls when selected and handles seat updates', () => {
		const onSeatsChange = vi.fn();
		renderScenarioCard({ isSelected: true, onSeatsChange });

		const input = screen.getByLabelText('Number of Seats');
		fireEvent.change(input, { target: { value: '30' } });
		expect(onSeatsChange).toHaveBeenCalledWith('30');
	});

	it('compact mode omits the removed metrics and inputs', () => {
		renderScenarioCard({ compact: true });

		expect(screen.queryByText('Plan highlights')).not.toBeInTheDocument();
		expect(screen.queryByText('Cost to Customer')).not.toBeInTheDocument();
		expect(
			screen.queryByText('Incremental Cost to Customer (Estimated)'),
		).not.toBeInTheDocument();
		expect(screen.queryByText('Number of Seats')).not.toBeInTheDocument();
	});

	it('shows current sku customer input when selected and fires handlers', () => {
		const onCurrentSkuCustomerPriceChange = vi.fn();
		renderScenarioCard({
			isSelected: true,
			onCurrentSkuCustomerPriceChange,
		});

		const input = screen.getByLabelText(
			'Current SKU cost to Customer',
		) as HTMLInputElement;
		expect(input).toHaveAttribute('step', '0.01');
		fireEvent.change(input, { target: { value: '19.75' } });
		expect(onCurrentSkuCustomerPriceChange).toHaveBeenCalledWith(19.75);
	});

	it('shows current sku reseller input when selected and fires handlers', () => {
		const onCurrentSkuResellerPriceChange = vi.fn();
		renderScenarioCard({
			isSelected: true,
			onCurrentSkuResellerPriceChange,
		});

		const input = screen.getByLabelText(
			'Current SKU cost to Reseller',
		) as HTMLInputElement;
		expect(input).toHaveAttribute('step', '0.01');
		fireEvent.change(input, { target: { value: '15.25' } });
		expect(onCurrentSkuResellerPriceChange).toHaveBeenCalledWith(15.25);
	});

	it('shows target sku customer input when selected and fires handlers', () => {
		const onTargetSkuCustomerPriceChange = vi.fn();
		renderScenarioCard({
			isSelected: true,
			onTargetSkuCustomerPriceChange,
		});

		const input = screen.getByLabelText(
			'Target SKU cost to Customer',
		) as HTMLInputElement;
		expect(input).toHaveAttribute('step', '0.01');
		fireEvent.change(input, { target: { value: '25.5' } });
		expect(onTargetSkuCustomerPriceChange).toHaveBeenCalledWith(25.5);
	});

	it('shows target sku reseller input when selected and fires handlers', () => {
		const onTargetSkuResellerPriceChange = vi.fn();
		renderScenarioCard({
			isSelected: true,
			onTargetSkuResellerPriceChange,
		});

		const input = screen.getByLabelText(
			'Target SKU cost to Reseller',
		) as HTMLInputElement;
		expect(input).toHaveAttribute('step', '0.01');
		fireEvent.change(input, { target: { value: '21.75' } });
		expect(onTargetSkuResellerPriceChange).toHaveBeenCalledWith(21.75);
	});

	it('hides configurable inputs when card is not selected', () => {
		renderScenarioCard({ isSelected: false });

		expect(screen.queryByText('Number of Seats')).not.toBeInTheDocument();
		expect(
			screen.queryByText('Current SKU cost to Customer'),
		).not.toBeInTheDocument();
		expect(
			screen.queryByText('Target SKU cost to Customer'),
		).not.toBeInTheDocument();
		expect(
			screen.queryByText('Target SKU cost to Reseller'),
		).not.toBeInTheDocument();
	});

	it('hides incentive rows when partner is not eligible but keeps target margin row', () => {
		const nonEligibleFilters: PartnerFilters = {
			...DEFAULT_PARTNER_FILTERS,
			hasSolutionPartnerDesignation: false,
		};
		renderScenarioCard({ partnerFilters: nonEligibleFilters });

		expect(screen.queryByText(/CSP Core/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Strategic Accelerator/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Growth Accelerator/)).not.toBeInTheDocument();
		expect(screen.queryByText(/^Current SKU Margin/)).not.toBeInTheDocument();
		expect(screen.getByText(/^Target SKU Margin/)).toBeInTheDocument();
	});

	it('shows Strategic Accelerator for eligible ending SKUs', () => {
		renderScenarioCard();
		expect(screen.getByText(/Strategic Accelerator/)).toBeInTheDocument();
	});

	it('hides Strategic Accelerator for non-eligible ending SKUs', () => {
		const nonEligibleSku = {
			id: 'bs_only',
			name: 'Business Standard Only',
			upgradeType: UpgradeType.AI,
			listPrice: 12.5,
			promoPrice: 12.5,
			description: 'Standard only.',
			planHighlights: [],
			tagline: 'tagline',
			oneLiner: 'one-liner',
			solutionCapabilities: ['capability'],
		};

		renderScenarioCard({ endingSku: nonEligibleSku });
		expect(screen.queryByText(/Strategic Accelerator/)).not.toBeInTheDocument();
	});
});
