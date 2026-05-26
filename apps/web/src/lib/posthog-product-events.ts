'use client';

import posthog from 'posthog-js';
import { env } from '@/env';
import type {
	DashboardViewMode,
	FilterState,
	PostHogActivationMilestone,
	PostHogProductEventName,
} from '@repo/types';
import {
	POSTHOG_ACTIVATION_MILESTONES,
	POSTHOG_PRODUCT_EVENTS,
} from '@repo/types';

type EventProperties = Record<
	string,
	boolean | number | string | string[] | null | undefined
>;

const MILESTONE_STORAGE_PREFIX = 'posthog-activation-milestone:';

export function captureProductEvent(
	event: PostHogProductEventName,
	properties: EventProperties = {},
): void {
	if (typeof window === 'undefined' || !env.NEXT_PUBLIC_POSTHOG_KEY) {
		return;
	}

	try {
		posthog.capture(event, removeUndefinedProperties(properties));
	} catch (error) {
		console.warn('[PostHog] Failed to capture product event', event, error);
	}
}

export function captureActivationMilestoneOnce(
	milestone: PostHogActivationMilestone,
	properties: EventProperties = {},
): void {
	if (typeof window === 'undefined') {
		return;
	}

	const storageKey = `${MILESTONE_STORAGE_PREFIX}${milestone}`;
	try {
		if (window.sessionStorage.getItem(storageKey) === '1') {
			return;
		}

		window.sessionStorage.setItem(storageKey, '1');
	} catch {
		// Best-effort dedupe only.
	}

	captureProductEvent(POSTHOG_PRODUCT_EVENTS.activationMilestoneReached, {
		...properties,
		milestone,
	});
}

export function captureDashboardSearchUsed(params: {
	surface: string;
	viewMode?: DashboardViewMode;
	searchTerm: string;
	filters: FilterState;
	isDemo?: boolean;
}): void {
	const search = params.searchTerm.trim();
	if (search.length === 0) {
		return;
	}

	captureProductEvent(POSTHOG_PRODUCT_EVENTS.dashboardSearchUsed, {
		surface: params.surface,
		viewMode: params.viewMode,
		searchLength: search.length,
		hasFilters: countActiveFilters(params.filters) > 0,
		activeFilterCount: countActiveFilters(params.filters),
		isDemo: params.isDemo ?? false,
	});
}

export function captureDashboardFilterApplied(params: {
	surface: string;
	viewMode?: DashboardViewMode;
	filterKey: keyof FilterState | string;
	selectedCount: number;
	totalActiveFilters: number;
	isDemo?: boolean;
}): void {
	captureProductEvent(POSTHOG_PRODUCT_EVENTS.dashboardFilterApplied, {
		surface: params.surface,
		viewMode: params.viewMode,
		filterKey: params.filterKey,
		selectedCount: params.selectedCount,
		totalActiveFilters: params.totalActiveFilters,
		isDemo: params.isDemo ?? false,
	});
}

export function captureDashboardFiltersCleared(params: {
	surface: string;
	viewMode?: DashboardViewMode;
	isDemo?: boolean;
}): void {
	captureProductEvent(POSTHOG_PRODUCT_EVENTS.dashboardFiltersCleared, {
		surface: params.surface,
		viewMode: params.viewMode,
		isDemo: params.isDemo ?? false,
	});
}

export function captureDashboardTabSwitched(params: {
	surface: string;
	fromTab: string;
	toTab: string;
	isDemo?: boolean;
	range?: string;
	tenantScope?: string;
}): void {
	if (params.fromTab === params.toTab) {
		return;
	}

	captureProductEvent(POSTHOG_PRODUCT_EVENTS.dashboardTabSwitched, {
		surface: params.surface,
		fromTab: params.fromTab,
		toTab: params.toTab,
		range: params.range,
		tenantScope: params.tenantScope,
		isDemo: params.isDemo ?? false,
	});
}

export function captureProposalStarted(properties: EventProperties): void {
	captureProductEvent(POSTHOG_PRODUCT_EVENTS.proposalStarted, properties);
	captureActivationMilestoneOnce(POSTHOG_ACTIVATION_MILESTONES.startedProposal, {
		isDemo: properties.isDemo,
	});
}

export function captureProposalScenariosSelected(
	properties: EventProperties,
): void {
	captureProductEvent(
		POSTHOG_PRODUCT_EVENTS.proposalScenariosSelected,
		properties,
	);
}

export function captureProposalAssetsRequested(properties: EventProperties): void {
	captureProductEvent(POSTHOG_PRODUCT_EVENTS.proposalAssetsRequested, properties);
	captureActivationMilestoneOnce(
		POSTHOG_ACTIVATION_MILESTONES.requestedProposalAsset,
		{
			isDemo: properties.isDemo,
		},
	);
}

export function captureProposalEmailLinkRequested(
	properties: EventProperties,
): void {
	captureProductEvent(
		POSTHOG_PRODUCT_EVENTS.proposalEmailLinkRequested,
		properties,
	);
}

export function captureProposalPptSessionRequested(
	properties: EventProperties,
): void {
	captureProductEvent(
		POSTHOG_PRODUCT_EVENTS.proposalPptSessionRequested,
		properties,
	);
}

export function capturePdfLinkRequested(properties: EventProperties): void {
	captureProductEvent(POSTHOG_PRODUCT_EVENTS.pdfLinkRequested, properties);
}

export function captureDownloadIntentClicked(properties: EventProperties): void {
	captureProductEvent(POSTHOG_PRODUCT_EVENTS.downloadIntentClicked, properties);
}

export function countActiveFilters(filters: FilterState): number {
	return Object.values(filters).reduce(
		(total, values) => total + (Array.isArray(values) ? values.length : 0),
		0,
	);
}

function removeUndefinedProperties(
	properties: EventProperties,
): Record<string, boolean | number | string | string[] | null> {
	return Object.fromEntries(
		Object.entries(properties).filter(([, value]) => value !== undefined),
	) as Record<string, boolean | number | string | string[] | null>;
}
