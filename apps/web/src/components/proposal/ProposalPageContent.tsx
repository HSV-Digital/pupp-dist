'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
	Button,
	Spinner,
	Tooltip,
} from '@fluentui/react-components';
import { getThemeConfig } from '@/lib/theme-config';
import {
	AddRegular,
	ArrowLeftRegular,
	ArrowRightRegular,
	Dismiss20Regular,
	MailRegular,
} from '@fluentui/react-icons';
import {
	allocateScenarioBaselines,
	buildRegionalPricingContext,
	getSeatRangeLowerBound,
	isRegionalCurrencyCode,
	type ProposalOptionsFilter,
	type ProposalOptionsJourney,
	type ScenarioAllocation,
	type StartingSkuId,
} from '@repo/shared';
import type { EndingSku } from '@repo/types';
import { captureElementByIdAsPngBlob } from '@/lib/element-screenshot';
import {
	buildCustomerOpportunities,
	type OpportunitySubscription,
	toOpportunityDescriptorMap,
} from '@/lib/opportunity-utils';
import {
	createProposalOptionsEmailLink,
	createProposalOptionsEmailLinkPublic,
} from '@/lib/proposal-options-email-link';
import { daysUntilRenewal } from '@/lib/filter-utils';
import {
	annualizeMonthlyPrice,
	calculateScenarioFromExplicitPrices,
	DEFAULT_CURRENT_SKU_MARGIN_PERCENT,
	deriveResellerPriceFromMargin,
} from '@/lib/rules-engine';
import {
	buildScenarioSelectionEntryKey,
	useScenarioSelection,
} from '@/lib/use-scenario-selection';
import {
	captureProposalAssetsRequested,
	captureProposalEmailLinkRequested,
	captureProposalScenariosSelected,
	captureProposalStarted,
} from '@/lib/posthog-product-events';
import { CustomerHeader } from '@/components/proposal/CustomerHeader';
import { OpportunityTabs } from '@/components/proposal/OpportunityTabs';
import {
	PartnerFilterPanel,
	DEFAULT_PARTNER_FILTERS,
} from '@/components/proposal/PartnerFilterPanel';
import type { PartnerFilters } from '@/components/proposal/PartnerFilterPanel';
import { ProposalSteps } from '@/components/proposal/proposal-steps';
import { ScenarioCard } from '@/components/proposal/ScenarioCard';
import { ScenarioCardSkeleton } from '@/components/proposal/ScenarioCardSkeleton';
import { useCurrency } from '@/lib/currency-context';
import type { Currency } from '@/i18n/currency-config';
import { CurrencySwitcher } from '@/components/CurrencySwitcher';

type ScenarioFilter = ProposalOptionsFilter;
const SCENARIO_CARDS_ROW_ID = 'scenario-cards-row';
const DEFAULT_SEND_ERROR_MESSAGE =
	'Unable to generate the proposal options email. Please try again.';
const CHAT_TO_PAID_STORAGE_KEY_PREFIX = 'chat-to-paid:';
const MAX_TOTAL_SEATS = 300;

function buildChatToPaidStorageKey(customerId: string): string {
	return `${CHAT_TO_PAID_STORAGE_KEY_PREFIX}${customerId}`;
}

export function readChatToPaidFlag(customerId: string): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return (
			window.sessionStorage.getItem(buildChatToPaidStorageKey(customerId)) ===
			'yes'
		);
	} catch {
		return false;
	}
}

function clampPrice(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const normalized = Math.max(0, value);
	return Math.round((normalized + Number.EPSILON) * 100) / 100;
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toStartingSkuId(value: string): StartingSkuId | null {
	switch (value) {
		case 'bb':
		case 'bs':
		case 'bp':
		case 'other':
			return value;
		default:
			return null;
	}
}

function triggerFileDownload(url: string): void {
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.target = '_blank';
	anchor.rel = 'noopener noreferrer';
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
}

export interface ProposalPageContentProps {
	customerId: string;
	customerName: string;
	subscriptions: OpportunitySubscription[];
	backHref: string;
	assetsBasePath: string;
	isNewCustomer?: boolean;
	isReseller?: boolean;
	showTpid?: boolean;
	showPartnerActions?: boolean;
	usePublicEmailApi?: boolean;
	loading?: boolean;
	/**
	 * When true, render the currency switcher above the scenario cards and
	 * apply the USD-base lock + reset-on-change behaviour. Currently only
	 * enabled on the csp-partners demo page.
	 */
	showCurrencySwitcher?: boolean;
	/**
	 * When true, on mount (and on customerId change) reset the currency to the
	 * customer's region-derived currency, overwriting any previously persisted
	 * cookie. The user can still change currency from the switcher afterwards.
	 */
	resetCurrencyToRegionOnMount?: boolean;
}

export function ProposalPageContent({
	customerId,
	customerName,
	subscriptions,
	backHref,
	assetsBasePath,
	isNewCustomer = false,
	isReseller = false,
	showTpid = true,
	showPartnerActions = true,
	usePublicEmailApi = false,
	loading = false,
	showCurrencySwitcher = false,
	resetCurrencyToRegionOnMount = false,
}: ProposalPageContentProps) {
	const t = useTranslations();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { currency, setCurrency, setLock } = useCurrency();
	const regionResetCustomerIdRef = useRef<string | null>(null);
	const [userChangedCurrencyOnPage, setUserChangedCurrencyOnPage] =
		useState(false);

	// Region-derived currency for the active customer (computed each render so
	// the very first paint after subscriptions arrive can already show prices
	// in the region currency — no flash of the cookie currency).
	const regionDerivedCurrency = useMemo<Currency | null>(() => {
		if (!resetCurrencyToRegionOnMount) return null;
		if (subscriptions.length === 0) return null;
		const ctx = buildRegionalPricingContext({
			region: subscriptions[0]?.region,
		});
		return isRegionalCurrencyCode(ctx.currency)
			? (ctx.currency as Currency)
			: null;
	}, [resetCurrencyToRegionOnMount, subscriptions]);

	// Until the user explicitly picks a currency from the switcher, prefer the
	// region-derived currency over the cookie value. Once they pick, their
	// choice wins and is persisted via the cookie.
	const effectiveCurrency: Currency =
		regionDerivedCurrency && !userChangedCurrencyOnPage
			? regionDerivedCurrency
			: currency;
	const previousCurrencyRef = useRef(effectiveCurrency);

	// Reset the user-override flag when the customer changes — each new
	// proposal page entry starts again from the region-derived default.
	useEffect(() => {
		regionResetCustomerIdRef.current = null;
		setUserChangedCurrencyOnPage(false);
	}, [customerId]);

	// Currency switching is available for every customer regardless of the
	// region stored on the subscription — the conversion-rate matrix bridges
	// any pair via USD, so non-USD-base customers can also re-display prices
	// in any of the 13 supported currencies.
	useEffect(() => {
		if (!showCurrencySwitcher) return;
		setLock(false);
	}, [showCurrencySwitcher, setLock]);

	// Persist the region-derived currency into the cookie/global state once per
	// customerId. The user can still override via the switcher afterwards.
	useEffect(() => {
		if (!regionDerivedCurrency) return;
		if (regionResetCustomerIdRef.current === customerId) return;
		regionResetCustomerIdRef.current = customerId;
		if (regionDerivedCurrency !== currency) {
			setCurrency(regionDerivedCurrency, { persist: true, silent: true });
		}
	}, [customerId, regionDerivedCurrency, currency, setCurrency]);

	const opportunities = useMemo(
		() =>
			buildCustomerOpportunities(subscriptions, {
				convertUsdToRegional: !isNewCustomer,
				currencyOverride: effectiveCurrency,
			}),
		[isNewCustomer, subscriptions, effectiveCurrency],
	);

	const hasRenewableOpportunities = opportunities.some(
		(o) => Math.floor(o.subscription.seatCount) > 0,
	);
	const hideOpportunityTabs = isNewCustomer || !hasRenewableOpportunities;

	const descriptors = useMemo(
		() => toOpportunityDescriptorMap(opportunities),
		[opportunities],
	);

	const {
		hydrated,
		selections,
		selectedCount,
		hasSelections,
		getSelection,
		getSelectionsForOpportunity,
		selectScenario,
		deselectScenario,
		updateSeats,
		updateCurrentSkuCustomerPrice,
		updateCurrentSkuResellerPrice,
		updateTargetSkuCustomerPrice,
		updateTargetSkuResellerPrice,
		resetPricesForCurrency,
	} = useScenarioSelection({
		customerId,
		descriptors,
		currency: effectiveCurrency,
	});

	// Detect user-initiated currency changes (via CurrencySwitcher) and lock
	// the page to the cookie/state currency from that point on, so the region
	// override stops winning once the user has explicitly picked.
	useEffect(() => {
		if (!resetCurrencyToRegionOnMount) return;
		if (!regionDerivedCurrency) return;
		if (currency !== regionDerivedCurrency && !userChangedCurrencyOnPage) {
			setUserChangedCurrencyOnPage(true);
		}
	}, [
		resetCurrencyToRegionOnMount,
		regionDerivedCurrency,
		currency,
		userChangedCurrencyOnPage,
	]);

	useEffect(() => {
		if (!showCurrencySwitcher) return;
		const previous = previousCurrencyRef.current;
		if (previous === effectiveCurrency) return;
		previousCurrencyRef.current = effectiveCurrency;
		// Reset every stored input to the new currency's defaults: current SKU
		// reseller price → 0; target SKU reseller price → derived from margin ×
		// new-currency default customer price (not 0).
		resetPricesForCurrency();
	}, [showCurrencySwitcher, effectiveCurrency, resetPricesForCurrency]);

	const selectionAllocationByKey = useMemo(() => {
		// Each selected scenario is an *alternative* — the customer picks one,
		// not a split. `originalSeats` per scenario stays at the opportunity's full
		// DB value (used for downstream template aggregations and price-per-user
		// fallbacks); the user-edited proposal seats drive `expiringArr` and all
		// current/target ARR math. Returning an empty map makes downstream lookups
		// fall back to subscription.seatCount.
		return new Map<string, ScenarioAllocation>();
	}, []);

	const selectedProposals = useMemo(() => {
		const result: {
			selectionKey: string;
			opportunityId: string;
			endingSkuId: string;
			startSkuName: string;
			endSkuName: string;
			seats: number;
			startSeats: number;
		}[] = [];
		for (const selection of selections.values()) {
			const selectionKey = buildScenarioSelectionEntryKey(
				selection.opportunityId,
				selection.endingSkuId,
			);
			const opp = opportunities.find(
				(o) => o.opportunityId === selection.opportunityId,
			);
			if (!opp) continue;
			const endingSku = opp.endingSkus.find(
				(s) => s.id === selection.endingSkuId,
			);
			result.push({
				selectionKey,
				opportunityId: selection.opportunityId,
				endingSkuId: selection.endingSkuId,
				startSkuName: opp.startingSku.name,
				endSkuName: endingSku?.name ?? selection.endingSkuId,
				seats: selection.seats,
				startSeats:
					selectionAllocationByKey.get(selectionKey)?.allocatedOriginalSeats ??
					opp.subscription.seatCount,
			});
		}
		return result;
	}, [selections, opportunities, selectionAllocationByKey]);

	const emptyMandatoryFieldLabels = useMemo(() => {
		const labels: string[] = [];
		for (const selection of selections.values()) {
			const opp = opportunities.find(
				(o) => o.opportunityId === selection.opportunityId,
			);
			if (!opp) continue;
			const endingSku = opp.endingSkus.find(
				(s) => s.id === selection.endingSkuId,
			);
			const endSkuName = endingSku?.name ?? selection.endingSkuId;
			if (Math.floor(selection.seats) <= 0) {
				labels.push(`At least 1 seat for ${endSkuName}`);
			}
			const hasCurrentSku =
				opp.startingSku.monthlyPrice && opp.startingSku.monthlyPrice > 0;
			if (
				hasCurrentSku &&
				(!selection.currentSkuResellerPrice ||
					selection.currentSkuResellerPrice <= 0)
			) {
				labels.push(
					isReseller
						? `Buying Price for ${opp.startingSku.name}`
						: `Cost to Reseller for ${opp.startingSku.name}`,
				);
			}
			if (
				!selection.targetSkuResellerPrice ||
				selection.targetSkuResellerPrice <= 0
			) {
				labels.push(
					isReseller
						? `Buying Price for ${endSkuName}`
						: `Cost to Reseller for ${endSkuName}`,
				);
			}
		}
		return labels;
	}, [selections, opportunities, isReseller]);
	const allResellerPricesValid = emptyMandatoryFieldLabels.length === 0;

	const [selectedOpportunityId, setSelectedOpportunityId] = useState<
		string | null
	>(null);
	const [scenarioFilter, setScenarioFilter] = useState<ScenarioFilter>('all');
	const [partnerFilters, setPartnerFilters] = useState<PartnerFilters>(() => {
		if (typeof window === 'undefined') return DEFAULT_PARTNER_FILTERS;
		try {
			const stored = window.sessionStorage.getItem(`partner-filters:${customerId}`);
			if (stored) {
				const parsed = JSON.parse(stored);
				return { ...DEFAULT_PARTNER_FILTERS, ...parsed };
			}
		} catch { /* ignore */ }
		return DEFAULT_PARTNER_FILTERS;
	});
	const [sendingPartnerEmail, setSendingPartnerEmail] = useState(false);
	const [partnerEmailError, setPartnerEmailError] = useState<string | null>(
		null,
	);
	const hasCapturedProposalStartRef = useRef(false);
	const previousSelectedCountRef = useRef(0);

	const totalSelectedSeats = useMemo(() => {
		let total = 0;
		for (const selection of selections.values()) {
			total += Math.max(0, Math.floor(selection.seats));
		}
		return total;
	}, [selections]);

	const tabParam = searchParams.get('tab');

	const activeOpportunityId = useMemo(() => {
		if (
			selectedOpportunityId &&
			opportunities.some((o) => o.opportunityId === selectedOpportunityId)
		) {
			return selectedOpportunityId;
		}

		if (tabParam) {
			const match = opportunities.find((o) => o.subscriptionId === tabParam);
			if (match) return match.opportunityId;
		}

		const today = new Date();
		const withRenewal = opportunities.filter(
			(o) => o.subscription.renewalDate && !Number.isNaN(new Date(o.subscription.renewalDate).getTime()),
		);
		const withoutRenewal = opportunities.filter(
			(o) => !o.subscription.renewalDate || Number.isNaN(new Date(o.subscription.renewalDate).getTime()),
		);
		const nearestUpcoming = withRenewal
			.filter((o) => daysUntilRenewal(o.subscription.renewalDate, today) >= 0)
			.sort((a, b) =>
				a.subscription.renewalDate.localeCompare(b.subscription.renewalDate),
			);
		const mostRecentPast = withRenewal
			.filter((o) => daysUntilRenewal(o.subscription.renewalDate, today) < 0)
			.sort((a, b) =>
				b.subscription.renewalDate.localeCompare(a.subscription.renewalDate),
			);
		return (
			nearestUpcoming[0]?.opportunityId ??
			mostRecentPast[0]?.opportunityId ??
			withoutRenewal[0]?.opportunityId ??
			null
		);
	}, [selectedOpportunityId, opportunities, tabParam]);

	const activeOpportunity = useMemo(
		() =>
			opportunities.find(
				(opportunity) => opportunity.opportunityId === activeOpportunityId,
			) ?? null,
		[opportunities, activeOpportunityId],
	);
	const assumedSeats = useMemo(() => {
		const seatRange = activeOpportunity?.subscription.seatRange;
		return seatRange ? getSeatRangeLowerBound(seatRange) : null;
	}, [activeOpportunity]);

	const renderedCards = useMemo<EndingSku[]>(() => {
		if (!activeOpportunity) return [];

		if (scenarioFilter === 'ai') {
			return activeOpportunity.endingSkus.filter(
				(endingSku) => endingSku.upgradeType === 'AI',
			);
		}

		if (scenarioFilter === 'security') {
			return activeOpportunity.endingSkus.filter(
				(endingSku) => endingSku.upgradeType === 'Security',
			);
		}

		return activeOpportunity.endingSkus;
	}, [activeOpportunity, scenarioFilter]);

	const cardsContainerClassName = 'grid gap-4 lg:grid-cols-3';
	const isDemoSurface =
		backHref.startsWith('/demo') || assetsBasePath.startsWith('/demo');

	useEffect(() => {
		if (typeof window === 'undefined') return;
		window.sessionStorage.setItem(
			`partner-filters:${customerId}`,
			JSON.stringify(partnerFilters),
		);
	}, [customerId, partnerFilters]);

	useEffect(() => {
		setPartnerEmailError(null);
	}, [activeOpportunityId, scenarioFilter]);

	useEffect(() => {
		if (!activeOpportunity || hasCapturedProposalStartRef.current) {
			return;
		}

		hasCapturedProposalStartRef.current = true;
		captureProposalStarted({
			entrySurface: isNewCustomer
				? 'new-customer-proposal'
				: usePublicEmailApi
					? 'public-proposal'
					: 'proposal-page',
			customerId,
			fromViewMode: isNewCustomer ? 'new-customer' : 'customer',
			selectedScenarioCount: selectedCount,
			isDemo: isDemoSurface,
			isPublic: usePublicEmailApi,
		});
	}, [
		activeOpportunity,
		customerId,
		isDemoSurface,
		isNewCustomer,
		selectedCount,
		usePublicEmailApi,
	]);

	useEffect(() => {
		if (
			selectedCount <= 0 ||
			selectedCount === previousSelectedCountRef.current
		) {
			previousSelectedCountRef.current = selectedCount;
			return;
		}

		captureProposalScenariosSelected({
			customerId,
			selectedScenarioCount: selectedCount,
			upgradeTypes: Array.from(
				new Set(
					selectedProposals
						.map(
							(proposal) =>
								opportunities
									.find(
										(opportunity) =>
											opportunity.opportunityId === proposal.opportunityId,
									)
									?.endingSkus.find((sku) => sku.id === proposal.endingSkuId)
									?.upgradeType,
						)
						.filter((upgradeType) => upgradeType !== undefined),
				),
			),
			isDemo: isDemoSurface,
			isPublic: usePublicEmailApi,
		});
		previousSelectedCountRef.current = selectedCount;
	}, [
		customerId,
		isDemoSurface,
		opportunities,
		selectedCount,
		selectedProposals,
		usePublicEmailApi,
	]);

	const handleSendProposalOptions = useCallback(async () => {
		setPartnerEmailError(null);

		if (!activeOpportunity) {
			setPartnerEmailError('No active opportunity is selected.');
			return;
		}

		const startingSkuId = toStartingSkuId(activeOpportunity.startingSku.id);
		if (!startingSkuId) {
			setPartnerEmailError(
				'The selected starting SKU is not supported for proposal options.',
			);
			return;
		}

		const renderedEndingSkuIds = renderedCards.map((sku) => sku.id);
		const renderedEndingSkuIdSet = new Set(renderedEndingSkuIds);
		const selectedScenariosForOpportunity = getSelectionsForOpportunity(
			activeOpportunity.opportunityId,
		)
			.filter((selection) => renderedEndingSkuIdSet.has(selection.endingSkuId))
			.map((selection) => {
				const selectionKey = buildScenarioSelectionEntryKey(
					selection.opportunityId,
					selection.endingSkuId,
				);
				const allocation = selectionAllocationByKey.get(selectionKey);
				const currentSkuCustomerPrice = clampPrice(
					selection.currentSkuCustomerPrice ??
						selection.expiringSkuRenewalPrice ??
						activeOpportunity.startingSku.monthlyPrice,
				);
				const currentSkuResellerPrice = clampPrice(
					selection.currentSkuResellerPrice ??
						deriveResellerPriceFromMargin({
							customerPrice: currentSkuCustomerPrice,
							marginPercent: DEFAULT_CURRENT_SKU_MARGIN_PERCENT,
						}),
				);
				const endingSku = activeOpportunity.endingSkus.find(
					(candidate) => candidate.id === selection.endingSkuId,
				);
				const targetSkuCustomerPrice = clampPrice(
					selection.targetSkuCustomerPrice ??
						selection.targetSkuPrice ??
						endingSku?.promoPrice ??
						0,
				);
				const targetSkuResellerPrice = clampPrice(
					selection.targetSkuResellerPrice ?? 0,
				);

				const originalSeats =
					allocation?.allocatedOriginalSeats ??
					activeOpportunity.subscription.seatCount;

				const proposedSeats = Math.max(0, Math.floor(selection.seats));
				return {
					opportunityId: selection.opportunityId,
					endingSkuId: selection.endingSkuId,
					selectedSeats: proposedSeats,
					originalSeats,
					// Current investment scales with the user-edited proposal seats so
					// current and target legs of the scenario move together.
					expiringArr: roundMoney(
						annualizeMonthlyPrice(currentSkuCustomerPrice, proposedSeats),
					),
					currentSkuCustomerPrice,
					currentSkuResellerPrice,
					targetSkuCustomerPrice,
					targetSkuResellerPrice,
					expiringSkuRenewalPrice: currentSkuCustomerPrice,
					targetSkuPrice: targetSkuCustomerPrice,
				};
			});
		const selectedEndingSkuIds =
			selectedScenariosForOpportunity.length > 0
				? selectedScenariosForOpportunity.map(
						(scenario) => scenario.endingSkuId,
					)
				: renderedEndingSkuIds;
		if (selectedEndingSkuIds.length === 0) {
			setPartnerEmailError(
				'No upgrade options are available for the selected filter.',
			);
			return;
		}

		// Each scenario is an alternative for the same opportunity — they all
		// carry the full DB seat count and full current investment. Don't sum
		// across scenarios (would multiply by the number of alternatives);
		// take the single opportunity-level baseline directly.
		const firstScenario = selectedScenariosForOpportunity[0];
		const aggregatedOriginalSeats = firstScenario
			? firstScenario.originalSeats
			: Math.max(0, Math.floor(activeOpportunity.subscription.seatCount));
		const aggregatedExpiringArr = firstScenario
			? firstScenario.expiringArr
			: roundMoney(
					annualizeMonthlyPrice(
						activeOpportunity.startingSku.monthlyPrice,
						activeOpportunity.subscription.seatCount,
					),
				);

		setSendingPartnerEmail(true);

		try {
			let screenshot: Blob | null = null;
			try {
				screenshot = await captureElementByIdAsPngBlob(SCENARIO_CARDS_ROW_ID);
			} catch (error) {
				console.warn(
					'Unable to capture scenario screenshot; proceeding without it.',
					error,
				);
			}

			const isOtherStartingSku = startingSkuId === 'other';
			const requestPayload = {
				journey: isOtherStartingSku
					? ('new_customer' as ProposalOptionsJourney)
					: ('renewal' as ProposalOptionsJourney),
				filter: scenarioFilter,
				customerId,
				customerName,
				opportunityId: activeOpportunity.opportunityId,
				startingSkuId,
				startingSkuName: activeOpportunity.startingSku.name,
				region: activeOpportunity.subscription.region,
				currency: effectiveCurrency,
				seats: aggregatedOriginalSeats,
				expiringArr: aggregatedExpiringArr,
				renewalDate: isNewCustomer
					? null
					: activeOpportunity.subscription.renewalDate,
				selectedEndingSkuIds,
				selectedScenarios:
					selectedScenariosForOpportunity.length > 0
						? selectedScenariosForOpportunity
						: undefined,
			};

			const emailLinkFn = usePublicEmailApi
				? createProposalOptionsEmailLinkPublic
				: createProposalOptionsEmailLink;
			const response = await emailLinkFn({
				payload: requestPayload,
				...(screenshot ? { screenshot } : {}),
			});
			captureProposalEmailLinkRequested({
				linkType: 'proposal-options',
				customerId,
				scenarioCount: selectedScenariosForOpportunity.length,
				filter: scenarioFilter,
				isDemo: isDemoSurface,
				isPublic: usePublicEmailApi,
			});

			triggerFileDownload(response.url);
		} catch (error) {
			setPartnerEmailError(
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: DEFAULT_SEND_ERROR_MESSAGE,
			);
		} finally {
			setSendingPartnerEmail(false);
		}
	}, [
		activeOpportunity,
		customerId,
		customerName,
		effectiveCurrency,
		getSelectionsForOpportunity,
		isNewCustomer,
		renderedCards,
		scenarioFilter,
		selectionAllocationByKey,
		usePublicEmailApi,
	]);

	// Build the assets navigation URL, forwarding ?from if present
	const from = searchParams.get('from');
	const assetsUrl = from
		? `${assetsBasePath}${assetsBasePath.includes('?') ? '&' : '?'}from=${from}`
		: assetsBasePath;

	if (!loading && opportunities.length === 0) {
		return (
			<div className="mx-auto flex flex-1 max-w-3xl flex-col items-center justify-center gap-4 p-8 text-center">
				<h2 className="m-0 font-ds-display text-(length:--ds-heading-m-font-size) font-(--ds-heading-m-font-weight) leading-(--ds-heading-m-line-height) tracking-(--ds-heading-m-letter-spacing)">
					No eligible upgrade opportunities
				</h2>
				<p className="mb-4 text-lg leading-7 text-gray-500">
					<span className="font-semibold">{customerName}</span> has
					subscriptions, but none map to supported starting SKUs for proposal
					generation.
				</p>
				<Button
					appearance="primary"
					icon={<ArrowLeftRegular className="size-5 mr-1" />}
					size="large"
					onClick={() => router.push(backHref)}
				>
					Back to Dashboard
				</Button>
			</div>
		);
	}

	return (
		<div className="app-shell-content-wrap relative min-h-screen pb-36">
			<ProposalSteps isNewCustomer={isNewCustomer} />
			<CustomerHeader
				customerName={customerName}
				tpid={showTpid && !isNewCustomer ? customerId : undefined}
				backHref={backHref}
				loading={loading}
			/>

			<div className="p-4 mb-6 rounded-xl bg-cover bg-center" style={{ backgroundImage: `url('${getThemeConfig().assets.proposalScenariosBackground}')` }}>
				<div className="bg-white rounded-xl p-2 pb-3 mb-4">
					<PartnerFilterPanel
						value={partnerFilters}
						onChange={setPartnerFilters}
					/>
				</div>

				{searchParams.get('reason') === 'missing-selections' && (
					<div className="mb-5 rounded-xl border border-yellow-200 bg-yellow-100 mt-4 px-4 py-3 font-ds-text text-sm text-yellow-600">
						No valid proposal selections were found. Choose at least one
						proposal before opening assets.
					</div>
				)}

				<div className="bg-white rounded-xl px-6 py-4">
					<div className="pb-4 border-b border-gray-200">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div data-testid="opportunity-panel" className="">
								<h2 className="font-ds-display text-xl font-semibold text-gray-900 px-2">
									{t('table.subscriptions')}
								</h2>
							</div>
							<div
								aria-label={t('proposal.subscriptionFilter')}
								className="flex items-center gap-4 overflow-hidden"
							>
								<Button
									type="button"
									size="medium"
									style={{
										padding: '6px 12px',
									}}
									data-testid="filter-ai-attach"
									aria-pressed={scenarioFilter === 'ai'}
									onClick={() => setScenarioFilter('ai')}
									appearance={scenarioFilter === 'ai' ? 'primary' : 'outline'}
									className={`${scenarioFilter === 'ai' ? 'bg-black! text-white' : 'text-gray-700! hover:text-foreground!'}`}
								>
									{t('proposal.aiAttach')}
								</Button>
								<Button
									type="button"
									size="medium"
									data-testid="filter-security-upsell"
									aria-pressed={scenarioFilter === 'security'}
									onClick={() => setScenarioFilter('security')}
									appearance={
										scenarioFilter === 'security' ? 'primary' : 'outline'
									}
									className={`${scenarioFilter === 'security' ? 'bg-black! text-white' : 'text-gray-700! hover:text-foreground!'}`}
								>
									{t('proposal.securityOption')}
								</Button>
								<Button
									type="button"
									size="medium"
									data-testid="filter-all-options"
									aria-pressed={scenarioFilter === 'all'}
									onClick={() => setScenarioFilter('all')}
									appearance={scenarioFilter === 'all' ? 'primary' : 'outline'}
									className={`${scenarioFilter === 'all' ? 'bg-black! text-white' : 'text-gray-700! hover:text-foreground!'}`}
								>
									{t('proposal.allOptions')}
								</Button>
							</div>
						</div>
					</div>

					<div
						data-testid="proposal-background"
						className="grid grid-cols-12 mt-4"
					>
						{!hideOpportunityTabs && (
							<aside className="col-span-3 h-full self-start pr-2 border-r border-gray-200">
								{loading ? (
									<div className="flex flex-col gap-2">
										{Array.from({ length: 3 }, (_, i) => (
											<div
												key={i}
												className="h-16 w-full animate-pulse rounded-lg bg-gray-200"
											/>
										))}
									</div>
								) : (
									<div className="sticky top-16">
										<OpportunityTabs
											opportunities={opportunities}
											activeOpportunityId={activeOpportunityId}
											onChange={setSelectedOpportunityId}
										/>
									</div>
								)}
							</aside>
						)}
						<div
							className={`${hideOpportunityTabs ? 'col-span-12' : 'col-span-9'} ml-4`}
						>
							<div className="mb-4 border-b border-gray-200 pb-4">
								<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
									<div className="flex flex-col gap-1">
										<p className="font-ds-text text-base font-medium">
											Select one or more options to generate the proposal
										</p>
										{assumedSeats !== null ? (
											<p className="font-ds-text text-xs text-gray-600">
												Assumed {assumedSeats} seats. Select an option to change
												the number of seats.
											</p>
										) : null}
									</div>
								</div>
							</div>
							{showCurrencySwitcher && (
								<div className="mb-3 flex items-center justify-end gap-3">
									<CurrencySwitcher variant="light" />
								</div>
							)}
							<div
								id={SCENARIO_CARDS_ROW_ID}
								data-testid="scenario-cards-row"
								className={cardsContainerClassName}
							>
								{loading
									? Array.from({ length: 3 }, (_, i) => (
											<ScenarioCardSkeleton key={i} />
										))
									: activeOpportunity &&
										renderedCards.map((endingSku) => {
											const selection = getSelection(
												activeOpportunity.opportunityId,
												endingSku.id,
											);
											const isSelected = Boolean(selection);
											const seats = isSelected
												? (selection?.seats ??
													activeOpportunity.subscription.seatCount)
												: activeOpportunity.subscription.seatCount;
											const currentSkuCustomerPrice = clampPrice(
												selection?.currentSkuCustomerPrice ??
													selection?.expiringSkuRenewalPrice ??
													activeOpportunity.startingSku.monthlyPrice,
											);
											const currentSkuResellerPrice = clampPrice(
												selection?.currentSkuResellerPrice ?? 0,
											);
											const targetSkuCustomerPrice = clampPrice(
												selection?.targetSkuCustomerPrice ??
													selection?.targetSkuPrice ??
													endingSku.promoPrice,
											);
											const targetSkuResellerPrice = clampPrice(
												selection?.targetSkuResellerPrice ?? 0,
											);

											const dbCurrentSeats = Math.max(
												0,
												Math.floor(activeOpportunity.subscription.seatCount),
											);
											const proposal = calculateScenarioFromExplicitPrices(
												activeOpportunity.startingSku,
												endingSku,
												seats,
												{
													currentSkuCustomerPrice,
													currentSkuResellerPrice,
													targetSkuCustomerPrice,
													targetSkuResellerPrice,
												},
												{
													journey:
														activeOpportunity.startingSku.id === 'other'
															? 'new_customer'
															: 'renewal',
													region: activeOpportunity.subscription.region,
													country: activeOpportunity.pricingContext.country,
													// Unified seat policy: current and target legs both use the
													// user-edited proposal seats so the entire scenario scales
													// with the seats input (including the displayed expiring
													// renewal cost = scenario.currentAnnualValue).
													currentSeats: seats,
												},
											);

											const currentForCard = Math.max(
												0,
												Math.floor(selection?.seats ?? 0),
											);
											const otherSelectionsTotal =
												totalSelectedSeats - (isSelected ? currentForCard : 0);
											const maxAllowedSeats = Math.max(
												0,
												MAX_TOTAL_SEATS - otherSelectionsTotal,
											);

											return (
												<ScenarioCard
													key={`${activeOpportunity.opportunityId}:${endingSku.id}`}
													opportunity={activeOpportunity}
													endingSku={endingSku}
													scenario={proposal}
													partnerFilters={partnerFilters}
													currentSkuCustomerPrice={currentSkuCustomerPrice}
													currentSkuResellerPrice={currentSkuResellerPrice}
													targetSkuCustomerPrice={targetSkuCustomerPrice}
													targetSkuResellerPrice={targetSkuResellerPrice}
													isSelected={isSelected}
													selectedSeats={seats}
													currentSeats={dbCurrentSeats}
													maxAllowedSeats={maxAllowedSeats}
													seatLimitTotal={MAX_TOTAL_SEATS}
													isNewCustomer={isNewCustomer}
													isReseller={isReseller}
													onToggle={() => {
														if (isSelected) {
															deselectScenario(
																activeOpportunity.opportunityId,
																endingSku.id,
															);
															return;
														}

														const remaining = Math.max(
															0,
															MAX_TOTAL_SEATS - totalSelectedSeats,
														);
														const isFirstSelection = selectedCount === 0;
														const baseDefault = isFirstSelection
															? Math.min(
																	Math.max(
																		0,
																		Math.floor(
																			activeOpportunity.subscription.seatCount,
																		),
																	),
																	MAX_TOTAL_SEATS,
																)
															: 0;
														const defaultSeats = Math.min(
															baseDefault,
															remaining,
														);

														selectScenario(
															activeOpportunity.opportunityId,
															activeOpportunity.startingSku.id,
															endingSku.id,
															defaultSeats,
															{
																currentSkuCustomerPrice,
																currentSkuResellerPrice,
																targetSkuCustomerPrice,
																targetSkuResellerPrice,
															},
														);
													}}
													onSeatsChange={(nextSeats) => {
														if (!isSelected) return;
														const requested = Math.max(
															0,
															Math.floor(Number(nextSeats) || 0),
														);
														const allowed = Math.max(
															0,
															MAX_TOTAL_SEATS - otherSelectionsTotal,
														);
														const clamped = Math.min(requested, allowed);
														updateSeats(
															activeOpportunity.opportunityId,
															endingSku.id,
															clamped,
														);
													}}
													onCurrentSkuResellerPriceChange={(
														nextCurrentSkuResellerPrice,
													) => {
														if (!isSelected) return;
														updateCurrentSkuResellerPrice(
															activeOpportunity.opportunityId,
															endingSku.id,
															nextCurrentSkuResellerPrice,
														);
													}}
													onCurrentSkuCustomerPriceChange={(
														nextCurrentSkuCustomerPrice,
													) => {
														if (!isSelected) return;
														updateCurrentSkuCustomerPrice(
															activeOpportunity.opportunityId,
															endingSku.id,
															nextCurrentSkuCustomerPrice,
														);
													}}
													onTargetSkuResellerPriceChange={(
														nextTargetSkuResellerPrice,
													) => {
														if (!isSelected) return;
														updateTargetSkuResellerPrice(
															activeOpportunity.opportunityId,
															endingSku.id,
															nextTargetSkuResellerPrice,
														);
													}}
													onTargetSkuCustomerPriceChange={(
														nextTargetSkuCustomerPrice,
													) => {
														if (!isSelected) return;
														updateTargetSkuCustomerPrice(
															activeOpportunity.opportunityId,
															endingSku.id,
															nextTargetSkuCustomerPrice,
														);
													}}
												/>
											);
										})}
							</div>
							{!loading && activeOpportunity && renderedCards.length === 0 && (
								<div className="rounded-lg border border-[#f7d8a8] bg-[#fff8ec] px-4 py-3 font-ds-text text-sm text-[#8a5a00]">
									No upgrade options match this filter for the selected
									opportunity.
								</div>
							)}
							{(() => {
								const productName = activeOpportunity?.subscription.currentProduct?.trim();
								const showIncentiveDisclaimer = !productName || productName === 'Other';
								return showIncentiveDisclaimer ? (
									<p className="mt-6 p-2 font-ds-text text-xs italic bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg">
										{t('proposal.incentiveCalculationDisclaimer')}
									</p>
								) : null;
							})()}
							<p className="mt-2 p-2 font-ds-text text-xs italic bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg">
								{t('proposal.disclaimer')}
							</p>
							<p className="mt-2 p-2 font-ds-text text-xs italic bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg">
								{effectiveCurrency === 'CAD'
									? t('proposal.quebecDisclaimerFr')
									: t('proposal.quebecDisclaimer')}
							</p>
						</div>
						<div
							className={`col-span-12 sticky bottom-2 left-0 right-0 z-30 rounded-xl mt-4 shadow-2xl transition-all duration-300 ease-in-out ${
								hasSelections
									? 'translate-y-0 opacity-100'
									: 'translate-y-24 opacity-0 pointer-events-none'
							}`}
						>
							<div className="flex items-center justify-between gap-4 p-2 px-2 pr-4 bg-cover bg-bottom rounded-xl" style={{ backgroundImage: `url('${getThemeConfig().assets.proposalNextStepBanner}')` }}>
								<div className="grid grid-cols-3 items-center gap-2">
									{selectedProposals.map((p, i) => (
										<div
											key={p.selectionKey}
											className={`flex items-center gap-2`}
										>
											{i % 3 !== 0 && (
												<AddRegular className="size-6 text-white" />
											)}
											<div
												className="relative flex flex-col rounded-lg bg-white/20 border border-white/30 px-3 pr-8 py-2 cursor-pointer w-full"
												onClick={() =>
													setSelectedOpportunityId(p.opportunityId)
												}
											>
												<span className={`text-sm mb-1 leading-tight text-white ${getThemeConfig().typography.cardDescription.includes('medium') ? 'font-medium' : 'font-semibold'}`}>
													{p.endSkuName}
													<span className="mx-1">·</span>
													<span className="ml-0">{p.seats} seats</span>
												</span>
												<span className={`text-xs text-white/80 ${getThemeConfig().typography.cardDescription.includes('medium') ? 'font-normal' : 'font-medium'}`}>
													From: {p.startSkuName}
												</span>
												<Button
													appearance="transparent"
													icon={
														<Dismiss20Regular className="size-3 text-white" />
													}
													onClick={(e) => {
														e.stopPropagation();
														deselectScenario(p.opportunityId, p.endingSkuId);
													}}
													aria-label={`Remove ${p.endSkuName}`}
													size="small"
													className="absolute top-2 right-2 bg-white/30! rounded-full!"
													style={{ color: '', minWidth: 'auto' }}
												/>
											</div>
										</div>
									))}
									{selectedCount === 0 && (
										<p className="m-0 font-ds-text text-sm text-gray-500">
											No proposals selected
										</p>
									)}
								</div>
								{(() => {
									const isGenerateProposalDisabled =
										!hydrated || !hasSelections || !allResellerPricesValid;
									const generateProposalButton = (
										<Button
											appearance="primary"
											size="medium"
											className={
												getThemeConfig().styles.heroButtonClass || 'bg-black!'
											}
											style={{
												padding: '10px 16px',
												minWidth: '200px',
											}}
											icon={<ArrowRightRegular className="size-5" />}
											iconPosition="after"
											disabled={isGenerateProposalDisabled}
											onClick={() => {
												captureProposalAssetsRequested({
													customerId,
													scenarioCount: selectedCount,
													isDemo: isDemoSurface,
													isPublic: usePublicEmailApi,
												});
												router.push(assetsUrl);
											}}
										>
											{t('proposal.generateProposal')}
										</Button>
									);
									const tooltipContent =
										emptyMandatoryFieldLabels.length > 0 ? (
											<div className="flex flex-col gap-1 text-xs">
												<span className="font-semibold">
													Please fill the mandatory inputs:
												</span>
												<ul className="m-0 list-disc pl-4">
													{emptyMandatoryFieldLabels.map((label, idx) => (
														<li key={`${label}-${idx}`}>{label}</li>
													))}
												</ul>
											</div>
										) : (
											'Please fill the mandatory inputs'
										);
									return isGenerateProposalDisabled ? (
										<Tooltip
											content={tooltipContent}
											relationship="label"
											withArrow
										>
											<span className="inline-block">
												{generateProposalButton}
											</span>
										</Tooltip>
									) : (
										generateProposalButton
									);
								})()}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
