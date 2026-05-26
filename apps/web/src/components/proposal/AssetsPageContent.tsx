'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@fluentui/react-components';
import { getThemeConfig } from '@/lib/theme-config';
import { ChevronLeftRegular, ChevronRightRegular, ArrowDownloadRegular, OpenRegular, DocumentRegular } from '@fluentui/react-icons';
import { env } from '@/env';
import type { CreateCustomerProposalEmailLinkRequest } from '@/lib/customer-proposal-email-link';
import type { ProposalPptScenarioRequest } from '@/lib/proposal-ppt-session';
import {
	generateProposalAssetLineItem,
	generateProposalAssetLineItemPublic,
	generateProposalAssetLineItemReseller,
	loadProposalAssets,
	loadProposalAssetsPublic,
	loadProposalAssetsReseller,
	type GenerateProposalAssetLineItemResponse,
	type ProposalAssetsCustomerSnapshot,
	type ProposalAssetsCustomerSource,
	type ProposalAssetsLineItem,
	type ProposalAssetsPricingContext,
	type ProposalAssetsSummary,
	type ProposalAssetSelectionRequest,
} from '@/lib/proposal-assets-prepare';
import type { ScenarioSelection } from '@repo/types';
import { formatCurrencyCompact } from '@/lib/format-utils';
import {
	NEW_CUSTOMER_INCENTIVE_RATE,
	STRATEGIC_ACCELERATOR_SKU_IDS,
} from '@/lib/upgrade-matrix';
import {
	annualizeMonthlyPrice,
	calculateIncentives,
	getRegionalStartingSkuMonthlyPrice,
	roundCurrency,
} from '@/lib/rules-engine';
import {
	getRegionalEndingSkuPrice,
	type RegionalPricingCountry,
} from '@repo/shared';
import type { PartnerFilters } from '@/components/proposal/PartnerFilterPanel';
import {
	buildScenarioSelectionEntryKey,
	buildScenarioSelectionStorageKey,
	deserializeSelectionMap,
} from '@/lib/use-scenario-selection';
import {
	captureDashboardTabSwitched,
	captureProposalAssetsRequested,
	captureProposalPptSessionRequested,
} from '@/lib/posthog-product-events';
import { CustomerHeader } from '@/components/proposal/CustomerHeader';
import { PptPreviewFrame } from '@/components/proposal/PptPreviewFrame';
import { AssetsLeftColumn } from '@/components/proposal/AssetsLeftColumn';
import { readChatToPaidFlag } from '@/components/proposal/ProposalPageContent';
import { useCurrency } from '@/lib/currency-context';

const MIN_LOADING_MS = 800;

const EMPTY_SUMMARY: ProposalAssetsSummary = {
	currentAnnual: 0,
	listAnnual: 0,
	offerAnnual: 0,
	promoSavings: 0,
	incrementalCost: 0,
	incrementalIncentive: 0,
};
const DEFAULT_PRICING_CONTEXT: ProposalAssetsPricingContext = {
	region: null,
	country: 'US',
	currency: 'USD',
	currencySymbol: '$',
	locale: 'en-US',
	fallbackApplied: false,
	fallbackReason: 'none',
};

type AssetsLoadRequest =
	| {
			kind: 'auth';
			customerSource: ProposalAssetsCustomerSource;
	  }
	| {
			kind: 'public';
			customerSnapshot: ProposalAssetsCustomerSnapshot;
	  }
	| {
			kind: 'reseller';
	  }

interface LineItemRuntimeState {
	blobUrl: string | null;
	fileName: string | null;
	loading: boolean;
	error: string | null;
}

export interface AssetsPageContentProps {
	customerId: string;
	backHref: string;
	proposalBasePath: string;
	loadRequest?: AssetsLoadRequest | null;
	showPartnerEmail?: boolean;
	isNewCustomer?: boolean;
	loading?: boolean;
	showCspPartnerResources?: boolean;
}

export function AssetsPageContent({
	customerId,
	backHref,
	proposalBasePath,
	loadRequest = null,
	showPartnerEmail,
	isNewCustomer = false,
	loading = false,
	showCspPartnerResources = false,
}: AssetsPageContentProps) {
	const t = useTranslations();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { currency } = useCurrency();
	const hasRedirectedRef = useRef(false);
	const lineItemInFlightRef = useRef<
		Map<string, Promise<GenerateProposalAssetLineItemResponse>>
	>(new Map());
	const hasCapturedAssetsRequestRef = useRef(false);

	const [ready, setReady] = useState(false);
	const [customerName, setCustomerName] = useState('');
	const [selectedScenarios, setSelectedScenarios] = useState<
		ProposalPptScenarioRequest[]
	>([]);
	const [summary, setSummary] = useState<ProposalAssetsSummary>(EMPTY_SUMMARY);
	const [pricingContext, setPricingContext] =
		useState<ProposalAssetsPricingContext>(DEFAULT_PRICING_CONTEXT);
	const [proposalBundleDownloadUrl, setProposalBundleDownloadUrl] = useState<
		string | null
	>(null);
	const [assetsState, setAssetsState] = useState<{
		loading: boolean;
		error: string | null;
		consolidated: { blobUrl: string; fileName: string } | null;
		lineItems: ProposalAssetsLineItem[];
	}>({
		loading: false,
		error: null,
		consolidated: null,
		lineItems: [],
	});
	const [lineItemRuntime, setLineItemRuntime] = useState<
		Record<string, LineItemRuntimeState>
	>({});

	useEffect(() => {
		const timer = setTimeout(() => setReady(true), MIN_LOADING_MS);
		return () => clearTimeout(timer);
	}, []);

	const storedSelections = useMemo<ScenarioSelection[]>(() => {
		if (!ready || typeof window === 'undefined') {
			return [];
		}

		const storageKey = buildScenarioSelectionStorageKey(customerId);
		const raw = window.sessionStorage.getItem(storageKey);
		const map = deserializeSelectionMap(raw);
		return Array.from(map.values());
	}, [customerId, ready]);
	const selectionsHydrated = ready;

	const storedPartnerFilters = useMemo<PartnerFilters | null>(() => {
		if (!ready || typeof window === 'undefined') return null;
		try {
			const raw = window.sessionStorage.getItem(`partner-filters:${customerId}`);
			if (raw) return JSON.parse(raw) as PartnerFilters;
		} catch { /* ignore */ }
		return null;
	}, [customerId, ready]);

	// Compact, JSON-safe partner-filter payload sent to backend endpoints so
	// load-assets summary, PPT rendering, and proposal email use the same
	// incentive-eligibility rule as ScenarioCard. See
	// `isIncentiveEligibleFromFilters` in `@repo/types`.
	const partnerFiltersPayload = useMemo(() => {
		if (!storedPartnerFilters) return undefined;
		return {
			partnerType: storedPartnerFilters.partnerType,
			hasSolutionPartnerDesignation:
				storedPartnerFilters.hasSolutionPartnerDesignation,
			hasOver25Points: storedPartnerFilters.hasOver25Points,
			isNewCustomerIncentive: storedPartnerFilters.isNewCustomerIncentive,
		};
	}, [storedPartnerFilters]);

	const newCustomerIncentiveTotal = 0;

	// Aggregate of per-scenario `incrementalIM` — mirrors ScenarioCard.tsx:246-328.
	// Margins use partner-edited customer/reseller prices (same path as
	// calculateScenarioFromExplicitPrices → annualValues, rules-engine.ts:154/527).
	// Incentives use canonical regional SKU prices (per the comment at
	// rules-engine.ts:499-500 and ScenarioCard.tsx:279-281).
	const totalEarnings = useMemo(() => {
		if (storedSelections.length === 0) return 0;
		const partnerType = storedPartnerFilters?.partnerType;
		const hasSolutionPartnerDesignation =
			storedPartnerFilters?.hasSolutionPartnerDesignation ?? false;
		const hasOver25Points = storedPartnerFilters?.hasOver25Points ?? false;
		const isIncentiveEligible =
			(partnerType === 'CSP Direct' && hasSolutionPartnerDesignation) ||
			(partnerType === 'CSP Indirect' && hasOver25Points);
		const includeNewCustomerIncentive = false;
		const regionCountry = (pricingContext.regionCountry ??
			pricingContext.country) as RegionalPricingCountry;
		const country = pricingContext.country as RegionalPricingCountry;

		return storedSelections.reduce((sum, sel) => {
			const isOtherSku = sel.startingSkuId === 'other';
			const seats = sel.seats ?? 0;
			const targetCustomerPrice = sel.targetSkuCustomerPrice ?? 0;
			const targetResellerPrice = sel.targetSkuResellerPrice ?? 0;
			const currentCustomerPrice = sel.currentSkuCustomerPrice ?? 0;
			const currentResellerPrice = sel.currentSkuResellerPrice ?? 0;

			// Margin side — partner-edited customer & reseller prices, both legs
			// using the user-edited seat count (unified seat policy, see
			// ProposalPageContent.tsx:965-969).
			const offerAnnualValue = annualizeMonthlyPrice(targetCustomerPrice, seats);
			const targetResellerAnnualValue = annualizeMonthlyPrice(
				targetResellerPrice,
				seats,
			);
			const currentAnnualValue = annualizeMonthlyPrice(
				currentCustomerPrice,
				seats,
			);
			const currentResellerAnnualValue = annualizeMonthlyPrice(
				currentResellerPrice,
				seats,
			);
			const targetSkuMarginAmount = roundCurrency(
				offerAnnualValue - targetResellerAnnualValue,
			);
			const currentSkuMarginAmount = roundCurrency(
				currentAnnualValue - currentResellerAnnualValue,
			);

			// Incentive side — canonical regional SKU prices, never partner-edited.
			// `sel.targetSkuPrice` on storedSelections is an alias for the partner-
			// edited customer price (use-scenario-selection.ts:298), so we cannot
			// use it here. Look up the canonical regional promo price instead, same
			// as ScenarioCard reads via `endingSku.promoPrice` after
			// applyRegionalPricingToEndingSku.
			const canonicalEndingPrice = getRegionalEndingSkuPrice({
				endingSkuId: sel.endingSkuId,
				country,
			});
			const canonicalPromoPrice = canonicalEndingPrice?.promoPrice ?? 0;
			const canonicalCurrentPrice =
				getRegionalStartingSkuMonthlyPrice({
					startingSkuId: sel.startingSkuId,
					country,
				}) ?? 0;
			const endingSkuIsPremium = STRATEGIC_ACCELERATOR_SKU_IDS.has(
				sel.endingSkuId,
			);
			const incentives = calculateIncentives({
				endingSkuId: sel.endingSkuId,
				targetPrice: canonicalPromoPrice,
				currentPrice: canonicalCurrentPrice,
				seats,
				currentSeats: seats,
				journey: isOtherSku ? 'new_customer' : 'renewal',
				isIncentiveEligible,
				endingSkuIsPremium,
				startingSkuId: sel.startingSkuId,
				country: regionCountry,
			});
			const newCustomerIncentive = includeNewCustomerIncentive
				? roundCurrency(targetResellerAnnualValue * NEW_CUSTOMER_INCENTIVE_RATE)
				: 0;
			const totalIM = roundCurrency(
				incentives.cspCore +
					incentives.strategicAccelerator +
					incentives.growthAccelerator +
					targetSkuMarginAmount +
					newCustomerIncentive,
			);
			const currentCspCore = isOtherSku ? 0 : incentives.cspCoreCurrent;
			const currentStrategic = isOtherSku
				? 0
				: incentives.strategicAcceleratorCurrent;
			const currentIM = roundCurrency(
				currentCspCore + currentStrategic + currentSkuMarginAmount,
			);
			const incrementalIM = roundCurrency(totalIM - currentIM);
			return sum + incrementalIM;
		}, 0);
	}, [storedPartnerFilters, storedSelections, pricingContext]);

	const selectionPayload = useMemo<ProposalAssetSelectionRequest[]>(
		() =>
			storedSelections.map((selection) => ({
				opportunityId: selection.opportunityId,
				endingSkuId: selection.endingSkuId,
				seats: selection.seats,
				currentSkuCustomerPrice: selection.currentSkuCustomerPrice,
				currentSkuResellerPrice: selection.currentSkuResellerPrice,
				targetSkuCustomerPrice: selection.targetSkuCustomerPrice,
				targetSkuResellerPrice: selection.targetSkuResellerPrice,
				expiringSkuRenewalPrice: selection.expiringSkuRenewalPrice,
				targetSkuPrice: selection.targetSkuPrice,
				targetSkuMarginPercent: selection.targetSkuMarginPercent,
			})),
		[storedSelections],
	);

	const lineItemsByScenarioKey = useMemo(
		() =>
			new Map(
				assetsState.lineItems.map((lineItem) => [
					buildScenarioSelectionEntryKey(
						lineItem.opportunityId,
						lineItem.endingSkuId,
					),
					lineItem,
				]),
			),
		[assetsState.lineItems],
	);

	// Journey is driven by the actual current SKU on the selected scenarios:
	// only treat as 'new_customer' when every selection starts from 'other'
	// (i.e. no existing M365 BB/BS/BP subscription). Otherwise it's a renewal,
	// so the current investment / current incentives are computed correctly.
	const journey =
		storedSelections.length > 0 &&
		storedSelections.every((sel) => sel.startingSkuId === 'other')
			? 'new_customer'
			: 'renewal';
	const isDemoSurface =
		backHref.startsWith('/demo') || proposalBasePath.startsWith('/demo');
	const isCspDemoSurface =
		backHref.startsWith('/csp-partners/demo') ||
		proposalBasePath.startsWith('/csp-partners/demo');
	const isPublicSurface = loadRequest?.kind === 'public';
	const useChatToPaidFlyers =
		isCspDemoSurface && readChatToPaidFlag(customerId);

	const ensureLineItemAsset = async (scenarioKey: string) => {
		if (!loadRequest) {
			throw new Error(t('proposal.assetsLoading'));
		}

		const existing = lineItemRuntime[scenarioKey];
		const lineItem = lineItemsByScenarioKey.get(scenarioKey);
		if (!lineItem) {
			throw new Error(t('proposal.lineItemUnavailable'));
		}

		if (existing?.blobUrl) {
			return {
				opportunityId: lineItem.opportunityId,
				endingSkuId: lineItem.endingSkuId,
				selectedSeats: lineItem.selectedSeats,
				label: lineItem.label,
				fileName: existing.fileName ?? lineItem.fileName,
				blobUrl: existing.blobUrl,
				uploadedAt: '',
			};
		}

		const inFlight = lineItemInFlightRef.current.get(scenarioKey);
		if (inFlight) {
			return inFlight;
		}

		const selection = selectionPayload.find(
			(item) =>
				item.opportunityId === lineItem.opportunityId &&
				item.endingSkuId === lineItem.endingSkuId,
		) ?? {
			opportunityId: lineItem.opportunityId,
			endingSkuId: lineItem.endingSkuId,
			seats: lineItem.selectedSeats,
		};

		setLineItemRuntime((prev) => ({
			...prev,
			[scenarioKey]: {
				blobUrl: prev[scenarioKey]?.blobUrl ?? null,
				fileName: prev[scenarioKey]?.fileName ?? lineItem.fileName,
				loading: true,
				error: null,
			},
		}));

		captureProposalPptSessionRequested({
			customerId,
			scenarioCount: 1,
			scenarioKey,
			isDemo: isDemoSurface,
			isPublic: isPublicSurface,
		});

		const request =
			loadRequest.kind === 'auth'
				? generateProposalAssetLineItem({
						journey,
						customerId,
						customerSource: loadRequest.customerSource,
						selection,
						selectionContext: selectionPayload,
						currency,
						partnerFilters: partnerFiltersPayload,
					})
				: loadRequest.kind === 'reseller'
					? generateProposalAssetLineItemReseller({
							journey,
							customerId,
							customerSource: 'reseller_customer',
							selection,
							selectionContext: selectionPayload,
							currency,
							partnerFilters: partnerFiltersPayload,
						})
					: generateProposalAssetLineItemPublic({
							journey,
							customerSnapshot: loadRequest.customerSnapshot,
							selection,
							selectionContext: selectionPayload,
							useChatToPaidFlyers,
							currency,
							partnerFilters: partnerFiltersPayload,
						});

		const task = request
			.then((response) => {
				setLineItemRuntime((prev) => ({
					...prev,
					[scenarioKey]: {
						blobUrl: response.blobUrl,
						fileName: response.fileName,
						loading: false,
						error: null,
					},
				}));
				return response;
			})
			.catch((error: unknown) => {
				setLineItemRuntime((prev) => ({
					...prev,
					[scenarioKey]: {
						blobUrl: null,
						fileName: lineItem.fileName,
						loading: false,
						error:
							error instanceof Error
								? error.message
								: 'Failed to generate Proposal preview',
					},
				}));
				throw error;
			})
			.finally(() => {
				lineItemInFlightRef.current.delete(scenarioKey);
			});

		lineItemInFlightRef.current.set(scenarioKey, task);
		return task;
	};

	// Build the redirect URL, forwarding ?from if present.
	const from = searchParams.get('from');
	const redirectBase = from
		? `${proposalBasePath}${proposalBasePath.includes('?') ? '&' : '?'}from=${from}`
		: proposalBasePath;

	useEffect(() => {
		if (loading || !loadRequest) return;
		if (!ready || !selectionsHydrated || hasRedirectedRef.current) return;
		if (storedSelections.length > 0) return;

		hasRedirectedRef.current = true;
		const separator = redirectBase.includes('?') ? '&' : '?';
		router.replace(`${redirectBase}${separator}reason=missing-selections`);
	}, [
		loadRequest,
		loading,
		ready,
		selectionsHydrated,
		storedSelections.length,
		router,
		redirectBase,
	]);

	useEffect(() => {
		let isCancelled = false;

		async function run() {
			if (
				loading ||
				!loadRequest ||
				!ready ||
				!selectionsHydrated ||
				selectionPayload.length === 0
			) {
				return;
			}

			if (!hasCapturedAssetsRequestRef.current) {
				hasCapturedAssetsRequestRef.current = true;
				captureProposalAssetsRequested({
					customerId,
					scenarioCount: selectionPayload.length,
					isDemo: isDemoSurface,
					isPublic: isPublicSurface,
				});
			}

			setAssetsState((prev) => ({ ...prev, loading: true, error: null }));
			try {
				const response =
					loadRequest.kind === 'auth'
						? await loadProposalAssets({
								journey,
								customerId,
								customerSource: loadRequest.customerSource,
								selections: selectionPayload,
								currency,
								partnerFilters: partnerFiltersPayload,
							})
						: loadRequest.kind === 'reseller'
							? await loadProposalAssetsReseller({
									journey,
									customerId,
									customerSource: 'reseller_customer',
									selections: selectionPayload,
									currency,
									partnerFilters: partnerFiltersPayload,
								})
							: await loadProposalAssetsPublic({
									journey,
									customerSnapshot: loadRequest.customerSnapshot,
									selections: selectionPayload,
									useChatToPaidFlyers,
									currency,
									partnerFilters: partnerFiltersPayload,
								});

				if (isCancelled) return;

				lineItemInFlightRef.current.clear();
				setCustomerName(response.customer.customerName);
				setSelectedScenarios(response.selectedScenarios);
				setSummary(response.summary);
				setPricingContext(response.pricingContext);
				setAssetsState({
					loading: false,
					consolidated: response.assets.consolidated,
					lineItems: response.assets.lineItems,
					error: null,
				});
				setLineItemRuntime({});
				setProposalBundleDownloadUrl(response.assets.bundleDownloadUrl);

				if (response.assets.lineItems.length === 1) {
					const lineItem = response.assets.lineItems[0];
					const scenarioKey = buildScenarioSelectionEntryKey(
						lineItem.opportunityId,
						lineItem.endingSkuId,
					);
					const selection = selectionPayload.find(
						(item) =>
							item.opportunityId === lineItem.opportunityId &&
							item.endingSkuId === lineItem.endingSkuId,
					) ?? {
						opportunityId: lineItem.opportunityId,
						endingSkuId: lineItem.endingSkuId,
						seats: lineItem.selectedSeats,
					};

					setLineItemRuntime({
						[scenarioKey]: {
							blobUrl: null,
							fileName: lineItem.fileName,
							loading: true,
							error: null,
						},
					});

					const lineItemRequest =
						loadRequest.kind === 'auth'
							? generateProposalAssetLineItem({
									journey,
									customerId,
									customerSource: loadRequest.customerSource,
									selection,
									selectionContext: selectionPayload,
									currency,
									partnerFilters: partnerFiltersPayload,
								})
							: loadRequest.kind === 'reseller'
								? generateProposalAssetLineItemReseller({
										journey,
										customerId,
										customerSource: 'reseller_customer',
										selection,
										selectionContext: selectionPayload,
										currency,
										partnerFilters: partnerFiltersPayload,
									})
								: generateProposalAssetLineItemPublic({
										journey,
										customerSnapshot: loadRequest.customerSnapshot,
										selection,
										selectionContext: selectionPayload,
										useChatToPaidFlyers,
										currency,
										partnerFilters: partnerFiltersPayload,
									});

					const task = lineItemRequest
						.then((lineItemResponse) => {
							if (isCancelled) {
								return lineItemResponse;
							}
							setLineItemRuntime((prev) => ({
								...prev,
								[scenarioKey]: {
									blobUrl: lineItemResponse.blobUrl,
									fileName: lineItemResponse.fileName,
									loading: false,
									error: null,
								},
							}));
							return lineItemResponse;
						})
						.catch((lineItemError: unknown) => {
							if (!isCancelled) {
								setLineItemRuntime((prev) => ({
									...prev,
									[scenarioKey]: {
										blobUrl: null,
										fileName: lineItem.fileName,
										loading: false,
										error:
											lineItemError instanceof Error
												? lineItemError.message
												: 'Failed to generate Proposal preview',
									},
								}));
							}
							throw lineItemError;
						})
						.finally(() => {
							lineItemInFlightRef.current.delete(scenarioKey);
						});

					lineItemInFlightRef.current.set(scenarioKey, task);
					void task.catch(() => undefined);
				}
			} catch (error) {
				if (isCancelled) return;
				setAssetsState({
					loading: false,
					consolidated: null,
					lineItems: [],
					error:
						error instanceof Error
							? error.message
							: 'Failed to generate Proposal preview',
				});
				setSummary(EMPTY_SUMMARY);
				setSelectedScenarios([]);
				setLineItemRuntime({});
				setProposalBundleDownloadUrl(null);
			}
		}

		void run();

		return () => {
			isCancelled = true;
		};
	}, [
		customerId,
		isDemoSurface,
		isPublicSurface,
		journey,
		loading,
		loadRequest,
		ready,
		selectionPayload,
		selectionsHydrated,
		useChatToPaidFlyers,
		partnerFiltersPayload,
		currency,
	]);

	const [selectedTab, setSelectedTab] = useState<string>('');
	const showConsolidatedPreview = Boolean(assetsState.consolidated);
	const navItems = useMemo(() => {
		const next: string[] = [];
		if (showConsolidatedPreview) {
			next.push('consolidated');
		}
		for (const lineItem of assetsState.lineItems) {
			next.push(
				buildScenarioSelectionEntryKey(
					lineItem.opportunityId,
					lineItem.endingSkuId,
				),
			);
		}
		return next;
	}, [assetsState.lineItems, showConsolidatedPreview]);
	const activeTab = useMemo(() => {
		if (navItems.includes(selectedTab)) {
			return selectedTab;
		}
		return navItems[0] ?? '';
	}, [navItems, selectedTab]);
	const currentNavIndex = navItems.indexOf(activeTab);
	const hasPrevious = currentNavIndex > 0;
	const hasNext = currentNavIndex >= 0 && currentNavIndex < navItems.length - 1;

	const activeLineItem =
		activeTab === 'consolidated'
			? null
			: (lineItemsByScenarioKey.get(activeTab) ?? null);
	const currentNavLabel =
		activeTab === 'consolidated'
			? t('proposal.consolidatedProposalDoc')
			: (activeLineItem?.label ?? 'Proposal');

	const handleSelectTab = (nextTab: string) => {
		captureDashboardTabSwitched({
			surface: 'proposal-assets-preview',
			fromTab: activeTab || 'uninitialized',
			toTab: nextTab,
			isDemo: isDemoSurface,
		});
		setSelectedTab(nextTab);
		if (
			nextTab !== 'consolidated' &&
			nextTab.length > 0 &&
			!assetsState.error
		) {
			void ensureLineItemAsset(nextTab);
		}
	};

	const activePreviewUrl = useMemo(() => {
		if (activeTab.length === 0) {
			return null;
		}
		if (activeTab === 'consolidated') {
			return assetsState.consolidated?.blobUrl ?? null;
		}
		return lineItemRuntime[activeTab]?.blobUrl ?? null;
	}, [activeTab, assetsState.consolidated, lineItemRuntime]);

	const endingSkuIds = useMemo(
		() => selectedScenarios.map((scenario) => scenario.endingSkuId),
		[selectedScenarios],
	);

	const individualPpts = assetsState.lineItems.map((lineItem) => {
		const scenarioKey = buildScenarioSelectionEntryKey(
			lineItem.opportunityId,
			lineItem.endingSkuId,
		);
		return {
			key: scenarioKey,
			label: lineItem.label,
			downloadUrl: lineItemRuntime[scenarioKey]?.blobUrl ?? null,
			loading: lineItemRuntime[scenarioKey]?.loading ?? false,
			error: lineItemRuntime[scenarioKey]?.error ?? null,
			onDownload: () => {
				void ensureLineItemAsset(scenarioKey)
					.then((asset) => {
						if (asset?.blobUrl) {
							window.open(asset.blobUrl, '_blank', 'noopener,noreferrer');
						}
					})
					.catch(() => undefined);
			},
		};
	});

	const customerProposalEmailRequest =
		useMemo<CreateCustomerProposalEmailLinkRequest | null>(() => {
			if (selectedScenarios.length === 0) {
				return null;
			}

			return {
				journey,
				customerId,
				customerName,
				currency,
				partnerFilters: partnerFiltersPayload,
				scenarios: selectedScenarios.map(
					({
						opportunityId,
						startingSkuId,
						startingSkuName,
						endingSkuId,
						selectedSeats,
						originalSeats,
						expiringArr,
						currentSkuCustomerPrice,
						currentSkuResellerPrice,
						targetSkuCustomerPrice,
						targetSkuResellerPrice,
						expiringSkuRenewalPrice,
						targetSkuPrice,
						region,
					}) => ({
						opportunityId,
						startingSkuId,
						startingSkuName,
						endingSkuId,
						selectedSeats,
						originalSeats,
						expiringArr,
						currentSkuCustomerPrice,
						currentSkuResellerPrice,
						targetSkuCustomerPrice,
						targetSkuResellerPrice,
						expiringSkuRenewalPrice,
						targetSkuPrice,
						region,
					}),
				),
			};
		}, [
			selectedScenarios,
			journey,
			customerId,
			customerName,
			currency,
			partnerFiltersPayload,
		]);

	const awaitingInitialAssetsLoad =
		Boolean(loadRequest) &&
		selectionPayload.length > 0 &&
		!assetsState.loading &&
		!assetsState.error &&
		selectedScenarios.length === 0 &&
		assetsState.consolidated === null &&
		assetsState.lineItems.length === 0;
	const showSkeleton =
		loading ||
		!loadRequest ||
		!ready ||
		!selectionsHydrated ||
		awaitingInitialAssetsLoad ||
		(assetsState.loading && !assetsState.error);
	const previewLoading =
		showSkeleton ||
		(activeTab !== 'consolidated' &&
			activeTab.length > 0 &&
			(lineItemRuntime[activeTab]?.loading ?? false));
	const previewError =
		assetsState.error ??
		(activeTab !== 'consolidated' ? lineItemRuntime[activeTab]?.error : null) ??
		null;

	if (!showSkeleton && selectedScenarios.length === 0) {
		return null;
	}

	return (
		<div className="relative min-h-screen rounded-lg bg-cover bg-bottom pt-2 pb-16" style={{ backgroundImage: `url('${getThemeConfig().assets.proposalPageBackground}')` }}>
			<div className="app-shell-content-wrap">
				<CustomerHeader
					customerName={customerName}
					backHref={backHref}
					loading={showSkeleton}
				/>

				{/* Consolidated Summary — always visible */}
				<div className={`rounded-xl bg-cover bg-top py-6 px-6 border-2 border-white mb-6 ${getThemeConfig().styles.heroTextClass}`} style={{ backgroundImage: `url('${getThemeConfig().assets.proposalSummaryBanner}')` }}>
					<h3 className="m-0 text-lg font-semibold">{t('proposal.consolidatedSummary')}</h3>
					{showSkeleton ? (
						<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
							{[3, 3, 4, 2].map((span, i) => (
								<div key={i} className={`lg:col-span-${span}`}>
									<div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
									<div className="mt-2 h-5 w-20 animate-pulse rounded bg-gray-200" />
								</div>
							))}
						</div>
					) : (
						<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
							<div className="lg:col-span-3">
								<p className={`m-0 text-xs uppercase tracking-[0.08em] ${getThemeConfig().styles.heroTextClass || 'text-gray-700'}`}>
									{t('proposal.targetSkuCostPromoPrice')}
								</p>
								<p className="m-0 mt-1 text-base font-mono font-semibold">
									{formatCurrencyCompact(summary.offerAnnual, {
										currency: pricingContext.currency,
										locale: pricingContext.locale,
										currencySymbol: pricingContext.currencySymbol,
									})}
								</p>
							</div>
							<div className="lg:col-span-3">
								<p className={`m-0 text-xs uppercase tracking-[0.08em] ${getThemeConfig().styles.heroTextClass || 'text-gray-700'}`}>
									{t('proposal.expiringSkuCost')}
								</p>
								<p className="m-0 mt-1 text-base font-mono font-semibold">
									{formatCurrencyCompact(summary.currentAnnual, {
										currency: pricingContext.currency,
										locale: pricingContext.locale,
										currencySymbol: pricingContext.currencySymbol,
									})}
								</p>
							</div>
							<div className="lg:col-span-3">
								<p className={`m-0 text-xs uppercase tracking-[0.08em] ${getThemeConfig().styles.heroTextClass || 'text-gray-800'}`}>
									{t('proposal.incrementalCostEstimated')}
								</p>
								<p className="m-0 mt-1 text-base font-mono font-semibold">
									{formatCurrencyCompact(summary.incrementalCost, {
										currency: pricingContext.currency,
										locale: pricingContext.locale,
										currencySymbol: pricingContext.currencySymbol,
									})}
								</p>
							</div>
							<div className="lg:col-span-3">
								<p className={`m-0 text-xs uppercase tracking-[0.08em] ${getThemeConfig().styles.heroTextClass || 'text-gray-800'}`}>
									{t('proposal.totalEarnings')}
								</p>
								<p className="m-0 mt-1 text-base font-mono font-semibold">
									{formatCurrencyCompact(totalEarnings, {
										currency: pricingContext.currency,
										locale: pricingContext.locale,
										currencySymbol: pricingContext.currencySymbol,
									})}
								</p>
								{newCustomerIncentiveTotal > 0 && (
									<p className="m-0 mt-1 text-[10px] text-gray-500">
										Includes {formatCurrencyCompact(newCustomerIncentiveTotal, {
											currency: pricingContext.currency,
											locale: pricingContext.locale,
											currencySymbol: pricingContext.currencySymbol,
										})} New Customer Incentive
									</p>
								)}
							</div>
						</div>
					)}
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
					<div className="lg:col-span-5">
						<AssetsLeftColumn
							customerName={customerName}
							endingSkuIds={endingSkuIds}
							showConsolidatedPpt={showConsolidatedPreview}
							loading={showSkeleton}
							showPartnerEmail={showPartnerEmail}
							customerProposalEmailRequest={customerProposalEmailRequest}
							proposalDownloadUrl={proposalBundleDownloadUrl}
							individualPpts={individualPpts}
							isDemo={isDemoSurface}
							isPublic={isPublicSurface}
							showCspPartnerResources={showCspPartnerResources}
						/>

					</div>
					<div className="lg:col-span-7 sticky top-0">
						<div className="mb-3 flex items-center justify-between rounded-xl border-2 border-white bg-white px-4 py-2">
							{showSkeleton ? (
								<>
									<Button
										appearance="subtle"
										icon={<ChevronLeftRegular />}
										disabled
										aria-label={t('proposal.previousProposal')}
									/>
									<div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
									<Button
										appearance="subtle"
										icon={<ChevronRightRegular />}
										disabled
										aria-label={t('proposal.nextProposal')}
									/>
								</>
							) : (
								<>
									<Button
										appearance="subtle"
										icon={<ChevronLeftRegular />}
										disabled={!hasPrevious}
										onClick={() =>
											handleSelectTab(navItems[currentNavIndex - 1] ?? '')
										}
										aria-label={t('proposal.previousProposal')}
									/>
									<div className="text-center">
										<span className="text-sm font-semibold">
											{currentNavLabel}
										</span>
										<span className="ml-2 text-xs text-gray-500">
											{currentNavIndex + 1} of {navItems.length}
										</span>
									</div>
									<Button
										appearance="subtle"
										icon={<ChevronRightRegular />}
										disabled={!hasNext}
										onClick={() =>
											handleSelectTab(navItems[currentNavIndex + 1] ?? '')
										}
										aria-label={t('proposal.nextProposal')}
									/>
								</>
							)}
						</div>
						{showSkeleton ? (
							<div className="rounded-xl border-2 border-white bg-white p-4 backdrop-blur-[80px]">
								<div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
								<div className="mt-4 aspect-4/3 w-full animate-pulse rounded-lg bg-gray-100" />
							</div>
						) : (
							<PptPreviewFrame
								title={t('proposal.customerProposalPreview')}
								loading={previewLoading}
								renderUrl={activePreviewUrl}
								downloadUrl={activePreviewUrl}
								error={previewError}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
