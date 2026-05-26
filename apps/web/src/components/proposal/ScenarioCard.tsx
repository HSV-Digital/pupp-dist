'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EndingSku, UpgradeScenario } from '@repo/types';
import {
	PLAN_DESCRIPTION_KEY,
	PLAN_HIGHLIGHTS_KEYS,
	isKnownEndingSku,
} from '@/lib/plan-translations';
import {
	formatCurrency,
	type CurrencyDisplayOptions,
} from '@/lib/format-utils';
import {
	annualizeMonthlyPrice,
	calculateIncentives,
	deriveMarginPercentFromPrices,
	getRegionalStartingSkuMonthlyPrice,
	getStrategicAcceleratorRate,
} from '@/lib/rules-engine';
import {
	INCENTIVE_RATES,
	NEW_CUSTOMER_INCENTIVE_RATE,
	STRATEGIC_ACCELERATOR_SKU_IDS,
} from '@/lib/upgrade-matrix';
import type { CustomerOpportunity } from '@/lib/opportunity-utils';
import type { PartnerFilters } from '@/components/proposal/PartnerFilterPanel';
import { CheckmarkSquareFilled, Square12Regular } from '@fluentui/react-icons';
import { Input, Label, Switch } from '@fluentui/react-components';
import { getThemeConfig } from '@/lib/theme-config';

interface ScenarioCardProps {
	opportunity: CustomerOpportunity;
	endingSku: EndingSku;
	scenario: UpgradeScenario;
	partnerFilters: PartnerFilters;
	currentSkuCustomerPrice: number;
	currentSkuResellerPrice: number;
	targetSkuCustomerPrice: number;
	targetSkuResellerPrice: number;
	isSelected: boolean;
	selectedSeats: number;
	/**
	 * DB-backed current seat count for the customer's existing subscription.
	 * Drives the current-leg of every economic display (current incentive,
	 * current SKU margin, current incentive+margin row, expiring SKU cost),
	 * regardless of what the partner types into the seats input. The seats
	 * input represents the *target* / proposed seat count.
	 */
	currentSeats: number;
	maxAllowedSeats: number;
	seatLimitTotal: number;
	onToggle: () => void;
	onSeatsChange: (nextSeats: unknown) => void;
	onCurrentSkuCustomerPriceChange: (price: number) => void;
	onCurrentSkuResellerPriceChange: (price: number) => void;
	onTargetSkuCustomerPriceChange: (price: number) => void;
	onTargetSkuResellerPriceChange: (price: number) => void;
	isNewCustomer?: boolean;
	isReseller?: boolean;
}

function roundCurrency(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toSeatInputValue(value: number): string {
	if (!Number.isFinite(value)) return '0';
	return String(Math.max(0, Math.floor(value)));
}

type SeatDraftValidation =
	| { kind: 'empty' }
	| { kind: 'valid'; value: string }
	| { kind: 'clamped'; value: string }
	| { kind: 'invalid'; message: string };

function validateSeatDraft(
	value: string,
	maxAllowedSeats: number,
): SeatDraftValidation {
	const trimmed = value.trim();
	if (trimmed === '') {
		return { kind: 'empty' };
	}

	if (trimmed.startsWith('-')) {
		return { kind: 'invalid', message: 'Seats cannot be negative.' };
	}

	if (!/^\d+$/.test(trimmed)) {
		return { kind: 'invalid', message: 'Enter a whole number of seats.' };
	}

	const parsed = Number.parseInt(trimmed, 10);
	if (parsed > maxAllowedSeats) {
		return { kind: 'clamped', value: String(maxAllowedSeats) };
	}
	return { kind: 'valid', value: String(parsed) };
}

function formatHeroPrice(price: number, currencySymbol: string): string {
	const normalized = Number.isFinite(price) ? price : 0;
	return normalized % 1 === 0
		? `${currencySymbol}${normalized.toFixed(0)}`
		: `${currencySymbol}${normalized.toFixed(2)}`;
}

function clampPrice(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const normalized = Math.max(0, value);
	return Math.round((normalized + Number.EPSILON) * 100) / 100;
}

function Row({
	label,
	value,
	emphasize = false,
	showDivider,
	subdued,
}: {
	label: string;
	value: string;
	emphasize?: boolean;
	showDivider?: boolean;
	subdued?: boolean;
}) {
	const shouldShowDivider = showDivider ?? emphasize;

	return (
		<div
			className={`flex items-start justify-between gap-3 py-1.5 ${shouldShowDivider ? 'border-t border-gray-200/60 mt-1 pt-2' : ''}`}
		>
			<span
				className={`text-xs leading-snug ${
					emphasize
						? 'font-semibold text-(--ds-color-violet-500)'
						: 'text-gray-600'
				} ${subdued ? 'text-gray-400' : ''}`}
			>
				{label}
			</span>
			<span
				className={`whitespace-nowrap font-mono text-xs ${
					emphasize
						? 'font-semibold text-(--ds-color-violet-500)'
						: 'font-medium text-gray-900'
				} ${subdued ? 'text-gray-400' : ''}`}
			>
				{value}
			</span>
		</div>
	);
}

export function ScenarioCard({
	opportunity,
	endingSku,
	scenario,
	partnerFilters,
	currentSkuCustomerPrice,
	currentSkuResellerPrice,
	targetSkuCustomerPrice,
	targetSkuResellerPrice,
	isSelected,
	selectedSeats,
	currentSeats,
	maxAllowedSeats,
	seatLimitTotal,
	onToggle,
	onSeatsChange,
	onCurrentSkuCustomerPriceChange,
	onCurrentSkuResellerPriceChange,
	onTargetSkuCustomerPriceChange,
	onTargetSkuResellerPriceChange,
	isNewCustomer = false,
	isReseller = false,
}: ScenarioCardProps) {
	const t = useTranslations();
	const [seatInput, setSeatInput] = useState(toSeatInputValue(selectedSeats));
	const [seatError, setSeatError] = useState<string | null>(null);
	const seatLimitMessage = t('proposal.seatLimitMessage', {
		max: seatLimitTotal,
	});
	const [showDetails, setShowDetails] = useState(false);
	const initialCurrentSkuCustomerPrice = useRef(currentSkuCustomerPrice);
	const hideCurrentFields = !initialCurrentSkuCustomerPrice.current || initialCurrentSkuCustomerPrice.current === 0;
	const resellerPricesValid =
		(hideCurrentFields || currentSkuResellerPrice > 0) &&
		targetSkuResellerPrice > 0;
	const targetSeats = Math.max(0, Math.floor(selectedSeats));
	const seatInputId = `seat-input-${opportunity.opportunityId}-${endingSku.id}`;
	const seatErrorId = `${seatInputId}-error`;
	const currentSkuResellerInputId = `current-reseller-input-${opportunity.opportunityId}-${endingSku.id}`;
	const currentSkuCustomerInputId = `current-customer-input-${opportunity.opportunityId}-${endingSku.id}`;
	const targetSkuResellerInputId = `target-reseller-input-${opportunity.opportunityId}-${endingSku.id}`;
	const targetSkuCustomerInputId = `target-customer-input-${opportunity.opportunityId}-${endingSku.id}`;

	const priceInputBaseClass =
		'w-18! rounded-md border px-3 py-2.5 font-mono! text-xs! font-semibold text-gray-900 shadow-sm outline-none transition-all';
	const priceInputErrorClass =
		'border-red-500 bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500';
	const priceInputNormalClass =
		'border-gray-200 bg-gray-50 focus:border-(--ds-color-violet-500) focus:bg-white focus:ring-1 focus:ring-(--ds-color-violet-500)';
	const getPriceInputClass = (value: number) =>
		`${priceInputBaseClass} ${value <= 0 ? priceInputErrorClass : priceInputNormalClass}`;
	const getPriceInputErrorStyle = (value: number) =>
		value <= 0
			? {
					border: '1px solid rgb(239 68 68)',
					backgroundColor: 'rgb(254 242 242)',
				}
			: {};

	const hasPromo = endingSku.listPrice !== endingSku.promoPrice;
	const currencyOptions: CurrencyDisplayOptions = {
		currency: opportunity.pricingContext.currency,
		locale: opportunity.pricingContext.locale,
		currencySymbol: opportunity.pricingContext.currencySymbol,
	};

	useEffect(() => {
		// Sync local seat input draft when selection changes externally.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setSeatInput(toSeatInputValue(targetSeats));
		if (!isSelected) {
			setShowDetails(false);
		}
	}, [targetSeats, isSelected]);

	useEffect(() => {
		if (!seatError) return;
		const timer = setTimeout(() => setSeatError(null), 2500);
		return () => clearTimeout(timer);
	}, [seatError]);

	useEffect(() => {
		// Hide details when reseller prices become invalid (e.g. reset to 0).
		if (!resellerPricesValid) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setShowDetails(false);
		}
	}, [resellerPricesValid]);

	const profitability = useMemo(() => {
		const { partnerType, hasSolutionPartnerDesignation, hasOver25Points } =
			partnerFilters;
		const { currentAnnualValue, offerAnnualValue, startingSkuId } = scenario;
		const isOtherSku = startingSkuId === 'other';
		const isIncentiveEligible =
			(partnerType === 'CSP Direct' && hasSolutionPartnerDesignation) ||
			(partnerType === 'CSP Indirect' && hasOver25Points);
		const endingSkuIsPremium = STRATEGIC_ACCELERATOR_SKU_IDS.has(endingSku.id);
		const targetSkuMarginPercent = deriveMarginPercentFromPrices({
			customerPrice: targetSkuCustomerPrice,
			resellerPrice: targetSkuResellerPrice,
		});
		const currentSkuMarginPercent = deriveMarginPercentFromPrices({
			customerPrice: currentSkuCustomerPrice,
			resellerPrice: currentSkuResellerPrice,
		});
		// Both current and target legs use the user-edited seat count, so the
		// entire scenario scales uniformly with the seats input.
		const currentResellerAnnualValue = annualizeMonthlyPrice(
			currentSkuResellerPrice,
			targetSeats,
		);
		const targetResellerAnnualValue = annualizeMonthlyPrice(
			targetSkuResellerPrice,
			targetSeats,
		);
		const currentSkuMarginAmount = roundCurrency(
			currentAnnualValue - currentResellerAnnualValue,
		);
		const targetSkuMarginAmount = roundCurrency(
			offerAnnualValue - targetResellerAnnualValue,
		);
		// Incentives are PINNED to the canonical regional SKU prices — they must
		// NOT move when the partner edits cost-to-customer / cost-to-reseller
		// fields. Only the seat count, journey, and SKU choice can change them.
		const canonicalCurrentPrice =
			getRegionalStartingSkuMonthlyPrice({
				startingSkuId,
				country: opportunity.pricingContext.country,
			}) ?? 0;
		// Strategic accelerator rate is region-bound (per Microsoft program), so
		// always resolve it from the original region — never from the override-
		// flipped `country`, which only exists to redirect SKU price lookups.
		const strategicAcceleratorRate = getStrategicAcceleratorRate(
			opportunity.pricingContext.regionCountry,
		);
		const incentives = calculateIncentives({
			endingSkuId: endingSku.id,
			targetPrice: endingSku.promoPrice,
			currentPrice: canonicalCurrentPrice,
			seats: targetSeats,
			currentSeats: targetSeats,
			journey: isOtherSku ? 'new_customer' : 'renewal',
			isIncentiveEligible,
			endingSkuIsPremium,
			startingSkuId,
			country: opportunity.pricingContext.regionCountry,
		});
		const cspCore = incentives.cspCore;
		const strategicAccelerator = incentives.strategicAccelerator;
		const growthAccelerator = incentives.growthAccelerator;
		const newCustomerIncentive = 0;
		const totalIM = roundCurrency(
			cspCore +
				strategicAccelerator +
				growthAccelerator +
				targetSkuMarginAmount +
				newCustomerIncentive,
		);
		// Current-leg incentives come from `calculateIncentives` (canonical SKU
		// pricing), so partner-edited reseller prices don't move them.
		const currentCspCore = isOtherSku ? 0 : incentives.cspCoreCurrent;
		const currentStrategic = isOtherSku
			? 0
			: incentives.strategicAcceleratorCurrent;
		const currentIM = roundCurrency(
			currentCspCore + currentStrategic + currentSkuMarginAmount,
		);
		const incrementalIM = roundCurrency(totalIM - currentIM);

		return {
			isOtherSku,
			isIncentiveEligible,
			endingSkuIsPremium,
			cspCore,
			strategicAccelerator,
			strategicAcceleratorRate,
			growthAccelerator,
			newCustomerIncentive,
			targetSkuMarginAmount,
			totalIM,
			currentIM,
			incrementalIM,
			targetSkuMarginPercent,
			currentSkuMarginPercent,
		};
	}, [
		targetSeats,
		currentSeats,
		currentSkuCustomerPrice,
		currentSkuResellerPrice,
		endingSku.id,
		endingSku.promoPrice,
		isNewCustomer,
		opportunity.pricingContext.country,
		opportunity.pricingContext.regionCountry,
		partnerFilters,
		scenario,
		targetSkuCustomerPrice,
		targetSkuResellerPrice,
	]);

	const shouldShowPromoSavings = scenario.promoSavingsAnnual !== 0;

	return (
		<div
			onClick={onToggle}
			className={`group flex h-full w-full min-w-0 py-4 px-6 gap-4 cursor-pointer flex-col overflow-hidden rounded-xl border transition-all duration-300 ${
				isSelected
					? 'border-(--ds-color-red-violet-600) bg-white/90 shadow-[0_8px_32px_rgba(112,37,115,0.15)]'
					: 'border-neutral-200 bg-neutral-50 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)]'
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<h3 className={`m-0 pr-2 leading-tight tracking-tight text-gray-900 ${getThemeConfig().typography.cardTitle}`}>
					{endingSku.name}
				</h3>
				{isSelected ? (
					<CheckmarkSquareFilled
						primaryFill="var(--ds-color-red-violet-700)"
						className="mt-0.5 size-6 shrink-0 drop-shadow-sm"
					/>
				) : (
					<Square12Regular
						primaryFill="currentColor"
						className="mt-0.5 size-6 shrink-0 text-gray-300 group-hover:text-(--ds-color-violet-500) transition-colors"
					/>
				)}
			</div>

			<div className="h-px border-t border-gray-200" />

			<div className="flex flex-col gap-1">
				<div className="flex items-baseline gap-2">
					<span className={`leading-none tracking-tighter text-gray-900 ${getThemeConfig().typography.cardPrice}`}>
						{formatHeroPrice(
							endingSku.promoPrice,
							opportunity.pricingContext.currencySymbol,
						)}
					</span>
					{hasPromo && (
						<span className={`text-gray-600 line-through decoration-gray-600/60 ${getThemeConfig().typography.cardPriceOriginal}`}>
							{formatHeroPrice(
								endingSku.listPrice,
								opportunity.pricingContext.currencySymbol,
							)}
						</span>
					)}
				</div>
				<p className="text-xs font-medium tracking-wider text-gray-600">
					{t('proposal.priceUnit')}
				</p>
			</div>

			<p className={`leading-relaxed text-(--ds-color-red-violet-700) ${getThemeConfig().typography.cardDescription}`}>
				{isKnownEndingSku(endingSku.id)
					? t(PLAN_DESCRIPTION_KEY[endingSku.id])
					: endingSku.description}
			</p>

			{isSelected && (
				<>
					<div className="h-px border-t border-gray-200" />
					<div
						className="flex flex-col gap-2"
						onClick={(event) => event.stopPropagation()}
					>
						<p className="text-sm font-semibold text-red-500 m-0">
							{t('proposal.configureProposal')}
						</p>
						<div className="flex items-center justify-between">
							<Label
								htmlFor={seatInputId}
								className="text-xs! font-medium text-gray-700"
							>
								{t('proposal.targetSeats')}<span className="text-red-600">*</span>
							</Label>
							<Input
								size="small"
								appearance="filled-darker"
								id={seatInputId}
								type="number"
								style={{
									width: `max(65px, calc(${seatInput.length}ch + 32px))`,
									borderRadius: '4px',
									boxShadow: 'none',
									padding: '6px 0px',
									...(seatError || targetSeats <= 0
										? {
												border: '1px solid rgb(239 68 68)',
												backgroundColor: 'rgb(254 242 242)',
											}
										: {}),
								}}
								min={0}
								max={maxAllowedSeats}
								value={seatInput}
								aria-invalid={Boolean(seatError) || targetSeats <= 0}
								aria-describedby={seatError ? seatErrorId : undefined}
								onChange={(_event, data) => {
									const next = data.value;
									const validation = validateSeatDraft(next, maxAllowedSeats);

									if (validation.kind === 'empty') {
										setSeatInput('');
										return;
									}

									if (validation.kind === 'invalid') {
										setSeatError(validation.message);
										return;
									}

									if (validation.kind === 'clamped') {
										setSeatInput(validation.value);
										setSeatError(seatLimitMessage);
										onSeatsChange(validation.value);
										return;
									}

									setSeatInput(validation.value);
									onSeatsChange(validation.value);
								}}
								onBlur={() => {
									const validation = validateSeatDraft(
										seatInput,
										maxAllowedSeats,
									);

									if (
										validation.kind === 'empty' ||
										validation.kind === 'invalid'
									) {
										setSeatInput(toSeatInputValue(targetSeats));
										return;
									}

									if (validation.kind === 'clamped') {
										setSeatInput(validation.value);
										setSeatError(seatLimitMessage);
										onSeatsChange(validation.value);
										return;
									}

									setSeatInput(validation.value);
									onSeatsChange(validation.value);
								}}
								className={`w-18! rounded-md border px-3 py-2.5 font-mono! text-xs! font-semibold text-gray-900 shadow-sm outline-none transition-all ${
									seatError || targetSeats <= 0
										? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500'
										: 'border-gray-200 bg-gray-50 focus:border-(--ds-color-violet-500) focus:bg-white focus:ring-1 focus:ring-(--ds-color-violet-500)'
								}`}
							/>
						</div>

						{seatError && (
							<p
								id={seatErrorId}
								data-testid="seat-input-error"
								aria-live="polite"
								className="m-0 mt-1.5 text-[11px] font-medium text-red-600 animate-in slide-in-from-top-1 fade-in duration-200"
							>
								{seatError}
							</p>
						)}

						<div className="flex flex-col gap-2">
							{!hideCurrentFields && (
							<>
							<p className="text-xs font-semibold text-(--ds-color-red-violet-700) uppercase tracking-wide m-0 bg-gray-100 px-2 py-1 rounded">{t('proposal.currentSkuCost')}</p>
							<div className="flex items-center justify-between">
								<Label
									htmlFor={currentSkuResellerInputId}
									className="text-xs! font-medium text-gray-700"
								>
									{isReseller
										? t('proposal.buyingPriceFor', { subscription: opportunity.startingSku.name })
										: t('proposal.costToReseller', { subscription: opportunity.startingSku.name })}{' '}
									<span className="text-red-600">*</span>
								</Label>
								<Input
									size="small"
									appearance="filled-darker"
									id={currentSkuResellerInputId}
									type="number"
									step={1}
									style={{
										width: `max(65px, calc(${String(currentSkuResellerPrice).length}ch + 32px))`,
										borderRadius: '4px',
										boxShadow: 'none',
										padding: '6px 0px',
										...getPriceInputErrorStyle(currentSkuResellerPrice),
									}}
									min={0}
									value={String(currentSkuResellerPrice)}
									onChange={(_event, data) => {
										const parsed = Number.parseFloat(data.value);
										onCurrentSkuResellerPriceChange(clampPrice(parsed));
									}}
									className={getPriceInputClass(currentSkuResellerPrice)}
								/>
							</div>
							<div className="flex items-center justify-between">
								<Label
									htmlFor={currentSkuCustomerInputId}
									className="text-xs! font-medium text-gray-700"
								>
									{isReseller
										? t('proposal.sellingPriceFor', { subscription: opportunity.startingSku.name })
										: t('proposal.costToCustomer', { subscription: opportunity.startingSku.name })}{' '}
									<span className="text-red-600">*</span>
								</Label>
								<Input
									size="small"
									appearance="filled-darker"
									id={currentSkuCustomerInputId}
									type="number"
									step={1}
									style={{
										width: `max(65px, calc(${String(currentSkuCustomerPrice).length}ch + 32px))`,
										borderRadius: '4px',
										boxShadow: 'none',
										padding: '6px 0px',
										...getPriceInputErrorStyle(currentSkuCustomerPrice),
									}}
									min={0}
									value={String(currentSkuCustomerPrice)}
									onChange={(_event, data) => {
										const parsed = Number.parseFloat(data.value);
										onCurrentSkuCustomerPriceChange(clampPrice(parsed));
									}}
									className={getPriceInputClass(currentSkuCustomerPrice)}
								/>
							</div>
							</>
							)}
							<p className="text-xs font-semibold text-(--ds-color-red-violet-700) uppercase tracking-wide m-0 bg-gray-100 px-2 py-1 rounded">{t('proposal.targetSkuCost')}</p>
							<div className="flex items-center justify-between">
								<Label
									htmlFor={targetSkuResellerInputId}
									className="text-xs! font-medium text-gray-700"
								>
									{isReseller
										? t('proposal.buyingPriceFor', { subscription: endingSku.name })
										: t('proposal.costToReseller', { subscription: endingSku.name })}{' '}
									<span className="text-red-600">*</span>
								</Label>
								<Input
									size="small"
									appearance="filled-darker"
									id={targetSkuResellerInputId}
									type="number"
									step={1}
									style={{
										width: `max(65px, calc(${String(targetSkuResellerPrice).length}ch + 32px))`,
										borderRadius: '4px',
										boxShadow: 'none',
										padding: '6px 0px',
										...getPriceInputErrorStyle(targetSkuResellerPrice),
									}}
									min={0}
									value={String(targetSkuResellerPrice)}
									onChange={(_event, data) => {
										const parsed = Number.parseFloat(data.value);
										onTargetSkuResellerPriceChange(clampPrice(parsed));
									}}
									className={getPriceInputClass(targetSkuResellerPrice)}
								/>
							</div>
							<div className="flex items-center justify-between">
								<Label
									htmlFor={targetSkuCustomerInputId}
									className="text-xs! font-medium text-gray-700"
								>
									{isReseller
										? t('proposal.sellingPriceFor', { subscription: endingSku.name })
										: t('proposal.costToCustomer', { subscription: endingSku.name })}{' '}
									<span className="text-red-600">*</span>
								</Label>
								<Input
									size="small"
									appearance="filled-darker"
									id={targetSkuCustomerInputId}
									type="number"
									step={1}
									style={{
										width: `max(65px, calc(${String(targetSkuCustomerPrice).length}ch + 32px))`,
										borderRadius: '4px',
										boxShadow: 'none',
										padding: '6px 0px',
										...getPriceInputErrorStyle(targetSkuCustomerPrice),
									}}
									min={0}
									value={String(targetSkuCustomerPrice)}
									onChange={(_event, data) => {
										const parsed = Number.parseFloat(data.value);
										onTargetSkuCustomerPriceChange(clampPrice(parsed));
									}}
									className={getPriceInputClass(targetSkuCustomerPrice)}
								/>
							</div>
							<p className="text-xs font-medium text-red-600 m-0 mt-2">
								* {t('proposal.mandatoryInputs')}
							</p>
							<div className={`flex items-center justify-between bg-gray-100 rounded-md px-4  py-2  mt-2 ${!resellerPricesValid ? 'opacity-50' : ''}`}>
								<span className="text-xs font-semibold text-(--ds-color-red-violet-700)">
									{t('proposal.offerCostingHint')}
								</span>
								<Switch
									checked={showDetails}
									disabled={!resellerPricesValid}
									onChange={(_ev, data) => setShowDetails(data.checked)}
								/>
							</div>
						</div>
					</div>
				</>
			)}
   
			{showDetails && <div className="h-px border-t border-gray-200" />}

			{showDetails && endingSku.planHighlights.length > 0 && (
				<div>
					<p className={`mb-4 tracking-widest uppercase text-gray-500 ${getThemeConfig().typography.cardSectionHeader}`}>
						{t('proposal.planHighlights')}
					</p>
					<ul className="m-0 list-none space-y-2 p-0">
						{(isKnownEndingSku(endingSku.id)
							? PLAN_HIGHLIGHTS_KEYS[endingSku.id].map((k) => t(k))
							: endingSku.planHighlights
						).map((highlight) => (
							<li
								key={highlight}
								className="flex items-start gap-2.5 text-xs leading-snug text-gray-600"
							>
								<div className="mt-[6px] size-1.5 shrink-0 rounded-full bg-(--ds-color-violet-400)" />
								{highlight}
							</li>
						))}
					</ul>
				</div>
			)}

			{showDetails && <div className="h-px border-t border-gray-200" />}

			{showDetails && (
				<div className="border-gray-200">
					<p className={`m-0 mb-2 uppercase tracking-widest text-gray-500 ${getThemeConfig().typography.cardSectionHeader}`}>
						{t('proposal.costOfCustomer')}
					</p>
					{!hideCurrentFields && (
					<Row
						label={t('proposal.expiringSkuCost')}
						value={formatCurrency(scenario.currentAnnualValue, currencyOptions)}
						subdued
					/>
					)}
					<Row
						label={t('proposal.targetSkuCostListPrice')}
						value={formatCurrency(scenario.listAnnualValue, currencyOptions)}
					/>
					{shouldShowPromoSavings && (
						<Row
							label={t('proposal.costSavingsPromos')}
							value={formatCurrency(
								scenario.promoSavingsAnnual,
								currencyOptions,
							)}
							emphasize
							showDivider={false}
						/>
					)}
					<Row
						label={t('proposal.targetSkuCostPromoPrice')}
						value={formatCurrency(scenario.offerAnnualValue, currencyOptions)}
						emphasize={shouldShowPromoSavings}
						showDivider={shouldShowPromoSavings}
					/>
					<Row
						label={t('proposal.incrementalCostEstimated')}
						value={formatCurrency(scenario.incrementalCost, currencyOptions)}
					/>
				</div>
			)}

			{showDetails && <div className="h-px border-t border-gray-200" />}

			{showDetails && (
				<div>
					<p className={`m-0 mb-2 uppercase tracking-widest text-gray-500 ${getThemeConfig().typography.cardSectionHeader}`}>
						{t('proposal.partnerProfitability')}
					</p>

					{profitability.isIncentiveEligible && (
						<>
							<Row
								label={`${t('proposal.cspCore')} (${(INCENTIVE_RATES.cspCore * 100).toFixed(2)}%)`}
								value={formatCurrency(profitability.cspCore, currencyOptions)}
							/>
							{profitability.endingSkuIsPremium && (
								<Row
									label={`${t('proposal.strategicAccelerator')} (${(profitability.strategicAcceleratorRate * 100).toFixed(2)}%)`}
									value={formatCurrency(
										profitability.strategicAccelerator,
										currencyOptions,
									)}
								/>
							)}
							{!profitability.isOtherSku && (
								<Row
									label={`${t('proposal.growthAccelerator')} (${(INCENTIVE_RATES.growthAccelerator * 100).toFixed(2)}%)`}
									value={formatCurrency(
										profitability.growthAccelerator,
										currencyOptions,
									)}
								/>
							)}
						</>
					)}

					{profitability.newCustomerIncentive > 0 && (
						<Row
							label={`${t('proposal.newCustomerIncentive')} (${(NEW_CUSTOMER_INCENTIVE_RATE * 100).toFixed(2)}%)`}
							value={formatCurrency(
								profitability.newCustomerIncentive,
								currencyOptions,
							)}
						/>
					)}

					<Row
						label={t('proposal.targetSkuMargin')}
						value={formatCurrency(
							profitability.targetSkuMarginAmount,
							currencyOptions,
						)}
					/>

					<Row
						label={t('proposal.totalIncentiveMargin')}
						value={formatCurrency(profitability.totalIM, currencyOptions)}
						emphasize
					/>
					{!hideCurrentFields && (
					<Row
						label={t('proposal.currentIncentiveMargin')}
						value={formatCurrency(profitability.currentIM, currencyOptions)}
					/>
					)}
					<Row
						label={
							profitability.isOtherSku && isNewCustomer
								? t('proposal.targetIncentiveMargin')
								: t('proposal.incrementalIncentiveMargin')
						}
						value={formatCurrency(profitability.incrementalIM, currencyOptions)}
						emphasize
					/>
				</div>
			)}
		</div>
	);
}
