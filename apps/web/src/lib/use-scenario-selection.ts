'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { ScenarioSelection } from '@repo/types';
import {
	deriveMarginPercentFromPrices,
	deriveResellerPriceFromMargin,
} from '@/lib/rules-engine';
import type { OpportunityDescriptor } from '@/lib/opportunity-utils';

type ScenarioSelectionMap = Map<string, ScenarioSelection>;

interface StoragePayloadV1 {
	version: 1;
	entries: [string, ScenarioSelection][];
}

interface StoragePayloadV2 {
	version: 2;
	entries: [string, ScenarioSelection][];
}

interface StoragePayloadV3 {
	version: 3;
	entries: [string, ScenarioSelection][];
}

interface StoragePayloadV4 {
	version: 4;
	entries: [string, ScenarioSelection][];
}

interface StoragePayloadV5 {
	version: 5;
	currency: string | null;
	entries: [string, ScenarioSelection][];
}

interface ScenarioSelectionState {
	selections: ScenarioSelectionMap;
	hydrated: boolean;
}

type Action =
	| {
			type: 'hydrate';
			payload: ScenarioSelectionMap;
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'sanitize';
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'select';
			payload: {
				opportunityId: string;
				startingSkuId: string;
				endingSkuId: string;
				defaultSeats: number;
				currentSkuCustomerPrice?: unknown;
				currentSkuResellerPrice?: unknown;
				targetSkuCustomerPrice?: unknown;
				targetSkuResellerPrice?: unknown;
				targetSkuPrice?: unknown;
				targetSkuMarginPercent?: unknown;
			};
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'deselect';
			payload: { opportunityId: string; endingSkuId: string };
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'updateSeats';
			payload: { opportunityId: string; endingSkuId: string; seats: unknown };
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'updateCurrentSkuCustomerPrice';
			payload: {
				opportunityId: string;
				endingSkuId: string;
				currentSkuCustomerPrice: unknown;
			};
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'updateCurrentSkuResellerPrice';
			payload: {
				opportunityId: string;
				endingSkuId: string;
				currentSkuResellerPrice: unknown;
			};
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'updateExpiringSkuRenewalPrice';
			payload: {
				opportunityId: string;
				endingSkuId: string;
				expiringSkuRenewalPrice: unknown;
			};
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'resetSeats';
			payload: { opportunityId: string; endingSkuId: string };
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| {
			type: 'updateTargetSkuCustomerPrice';
			payload: {
				opportunityId: string;
				endingSkuId: string;
				targetSkuCustomerPrice: unknown;
			};
	  }
	| {
			type: 'updateTargetSkuResellerPrice';
			payload: {
				opportunityId: string;
				endingSkuId: string;
				targetSkuResellerPrice: unknown;
			};
	  }
	| {
			type: 'updateTargetSkuPrice';
			payload: {
				opportunityId: string;
				endingSkuId: string;
				targetSkuPrice: unknown;
			};
	  }
	| {
			type: 'updateTargetSkuMarginPercent';
			payload: {
				opportunityId: string;
				endingSkuId: string;
				targetSkuMarginPercent: unknown;
			};
	  }
	| {
			type: 'resetPricesForCurrency';
			descriptors: Map<string, OpportunityDescriptor>;
	  }
	| { type: 'clear' };

const STORAGE_VERSION = 5;
const SEAT_HARD_LIMIT = 300;

function clampSeats(
	value: unknown,
	maxSeats: number,
	fallback: number,
): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;

	const normalizedMax = Math.max(0, Math.floor(maxSeats));
	const floored = Math.floor(parsed);
	if (floored < 0) return 0;
	if (floored > normalizedMax) return normalizedMax;
	return floored;
}

function clampOptionalNonNegativeNumber(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return undefined;
	}

	const normalized = Math.max(0, parsed);
	return Math.round((normalized + Number.EPSILON) * 100) / 100;
}

function clampOptionalMargin(value: unknown): number | undefined {
	const normalized = clampOptionalNonNegativeNumber(value);
	if (normalized === undefined) {
		return undefined;
	}

	return Math.min(100, normalized);
}

function getSharedCurrentSkuPricingForOpportunityFromSelections(
	selections: Iterable<ScenarioSelection>,
	opportunityId: string,
): {
	currentSkuCustomerPrice: number | undefined;
	currentSkuResellerPrice: number | undefined;
} {
	for (const selection of selections) {
		if (selection.opportunityId !== opportunityId) {
			continue;
		}

		return {
			currentSkuCustomerPrice: selection.currentSkuCustomerPrice,
			currentSkuResellerPrice: selection.currentSkuResellerPrice,
		};
	}

	return {
		currentSkuCustomerPrice: undefined,
		currentSkuResellerPrice: undefined,
	};
}

function normalizeOpportunityCurrentSkuPricing(
	selections: ScenarioSelectionMap,
): ScenarioSelectionMap {
	const sharedPricingByOpportunity = new Map<
		string,
		{
			currentSkuCustomerPrice: number | undefined;
			currentSkuResellerPrice: number | undefined;
		}
	>();

	for (const selection of selections.values()) {
		if (!sharedPricingByOpportunity.has(selection.opportunityId)) {
			sharedPricingByOpportunity.set(selection.opportunityId, {
				currentSkuCustomerPrice: selection.currentSkuCustomerPrice,
				currentSkuResellerPrice: selection.currentSkuResellerPrice,
			});
		}
	}

	const normalized = new Map<string, ScenarioSelection>();
	for (const [selectionKey, selection] of selections.entries()) {
		const sharedPricing = sharedPricingByOpportunity.get(
			selection.opportunityId,
		);
		normalized.set(
			selectionKey,
			withLegacyDerivedPricing({
				...selection,
				currentSkuCustomerPrice: sharedPricing?.currentSkuCustomerPrice,
				currentSkuResellerPrice: sharedPricing?.currentSkuResellerPrice,
			}),
		);
	}

	return normalized;
}

function getTargetSkuPricingDefaults(
	descriptor: OpportunityDescriptor,
	endingSkuId: string,
): {
	targetSkuCustomerPrice: number;
	targetSkuResellerPrice: number;
	targetSkuMarginPercent: number;
} {
	const defaults = descriptor.targetSkuPricingByEndingSkuId?.[endingSkuId];
	if (!defaults) {
		return {
			targetSkuCustomerPrice: 0,
			targetSkuResellerPrice: 0,
			targetSkuMarginPercent: 0,
		};
	}

	return {
		...defaults,
		targetSkuMarginPercent: deriveMarginPercentFromPrices({
			customerPrice: defaults.targetSkuCustomerPrice,
			resellerPrice: defaults.targetSkuResellerPrice,
		}),
	};
}

function withLegacyDerivedPricing(
	selection: ScenarioSelection,
): ScenarioSelection {
	const derivedTargetSkuMarginPercent =
		selection.targetSkuCustomerPrice !== undefined &&
		selection.targetSkuResellerPrice !== undefined
			? Math.round(
					(deriveMarginPercentFromPrices({
						customerPrice: selection.targetSkuCustomerPrice,
						resellerPrice: selection.targetSkuResellerPrice,
					}) +
						Number.EPSILON) *
						100,
				) / 100
			: selection.targetSkuMarginPercent;

	return {
		...selection,
		expiringSkuRenewalPrice: selection.currentSkuCustomerPrice,
		targetSkuPrice: selection.targetSkuCustomerPrice,
		targetSkuMarginPercent: derivedTargetSkuMarginPercent,
	};
}

function buildNormalizedSelection(params: {
	selection: ScenarioSelection;
	descriptor: OpportunityDescriptor;
	seats: number;
	sharedCurrentSkuCustomerPrice?: number;
	sharedCurrentSkuResellerPrice?: number;
	overrideCurrentSkuCustomerPrice?: unknown;
	overrideCurrentSkuResellerPrice?: unknown;
	overrideTargetSkuCustomerPrice?: unknown;
	overrideTargetSkuResellerPrice?: unknown;
	overrideTargetSkuPrice?: unknown;
	overrideTargetSkuMarginPercent?: unknown;
}): ScenarioSelection {
	const { selection, descriptor, seats } = params;
	const targetDefaults = getTargetSkuPricingDefaults(
		descriptor,
		selection.endingSkuId,
	);
	const currentSkuCustomerPrice =
		clampOptionalNonNegativeNumber(params.overrideCurrentSkuCustomerPrice) ??
		clampOptionalNonNegativeNumber(selection.currentSkuCustomerPrice) ??
		clampOptionalNonNegativeNumber(selection.expiringSkuRenewalPrice) ??
		params.sharedCurrentSkuCustomerPrice ??
		descriptor.currentSkuCustomerPrice ??
		0;
	const currentSkuResellerPrice =
		clampOptionalNonNegativeNumber(params.overrideCurrentSkuResellerPrice) ??
		clampOptionalNonNegativeNumber(selection.currentSkuResellerPrice) ??
		params.sharedCurrentSkuResellerPrice ??
		deriveResellerPriceFromMargin({
			customerPrice: currentSkuCustomerPrice,
			marginPercent: 20,
		});
	const targetSkuCustomerPrice =
		clampOptionalNonNegativeNumber(params.overrideTargetSkuCustomerPrice) ??
		clampOptionalNonNegativeNumber(params.overrideTargetSkuPrice) ??
		clampOptionalNonNegativeNumber(selection.targetSkuCustomerPrice) ??
		clampOptionalNonNegativeNumber(selection.targetSkuPrice) ??
		targetDefaults.targetSkuCustomerPrice;
	const targetSkuMarginPercent =
		clampOptionalMargin(params.overrideTargetSkuMarginPercent) ??
		clampOptionalMargin(selection.targetSkuMarginPercent) ??
		targetDefaults.targetSkuMarginPercent;
	const targetSkuResellerPrice =
		clampOptionalNonNegativeNumber(params.overrideTargetSkuResellerPrice) ??
		clampOptionalNonNegativeNumber(selection.targetSkuResellerPrice) ??
		deriveResellerPriceFromMargin({
			customerPrice: targetSkuCustomerPrice,
			marginPercent: targetSkuMarginPercent,
		});

	return withLegacyDerivedPricing({
		opportunityId: selection.opportunityId,
		startingSkuId: descriptor.startingSkuId,
		endingSkuId: selection.endingSkuId,
		seats,
		currentSkuCustomerPrice,
		currentSkuResellerPrice,
		targetSkuCustomerPrice,
		targetSkuResellerPrice,
	});
}

function isValidSelection(value: unknown): value is ScenarioSelection {
	if (!value || typeof value !== 'object') return false;

	const candidate = value as Partial<ScenarioSelection>;

	return (
		typeof candidate.opportunityId === 'string' &&
		candidate.opportunityId.length > 0 &&
		typeof candidate.startingSkuId === 'string' &&
		candidate.startingSkuId.length > 0 &&
		typeof candidate.endingSkuId === 'string' &&
		candidate.endingSkuId.length > 0 &&
		typeof candidate.seats === 'number' &&
		Number.isFinite(candidate.seats) &&
		(candidate.currentSkuCustomerPrice === undefined ||
			(typeof candidate.currentSkuCustomerPrice === 'number' &&
				Number.isFinite(candidate.currentSkuCustomerPrice))) &&
		(candidate.currentSkuResellerPrice === undefined ||
			(typeof candidate.currentSkuResellerPrice === 'number' &&
				Number.isFinite(candidate.currentSkuResellerPrice))) &&
		(candidate.targetSkuCustomerPrice === undefined ||
			(typeof candidate.targetSkuCustomerPrice === 'number' &&
				Number.isFinite(candidate.targetSkuCustomerPrice))) &&
		(candidate.targetSkuResellerPrice === undefined ||
			(typeof candidate.targetSkuResellerPrice === 'number' &&
				Number.isFinite(candidate.targetSkuResellerPrice))) &&
		(candidate.expiringSkuRenewalPrice === undefined ||
			(typeof candidate.expiringSkuRenewalPrice === 'number' &&
				Number.isFinite(candidate.expiringSkuRenewalPrice))) &&
		(candidate.targetSkuPrice === undefined ||
			(typeof candidate.targetSkuPrice === 'number' &&
				Number.isFinite(candidate.targetSkuPrice))) &&
		(candidate.targetSkuMarginPercent === undefined ||
			(typeof candidate.targetSkuMarginPercent === 'number' &&
				Number.isFinite(candidate.targetSkuMarginPercent)))
	);
}

function mapsEqual(
	left: ScenarioSelectionMap,
	right: ScenarioSelectionMap,
): boolean {
	if (left.size !== right.size) return false;

	for (const [selectionKey, selection] of left.entries()) {
		const other = right.get(selectionKey);
		if (!other) return false;
		if (
			other.opportunityId !== selection.opportunityId ||
			other.startingSkuId !== selection.startingSkuId ||
			other.endingSkuId !== selection.endingSkuId ||
			other.seats !== selection.seats ||
			other.currentSkuCustomerPrice !== selection.currentSkuCustomerPrice ||
			other.currentSkuResellerPrice !== selection.currentSkuResellerPrice ||
			other.targetSkuCustomerPrice !== selection.targetSkuCustomerPrice ||
			other.targetSkuResellerPrice !== selection.targetSkuResellerPrice
		) {
			return false;
		}
	}

	return true;
}

export function buildScenarioSelectionStorageKey(customerId: string): string {
	return `scenario-selections:${customerId}`;
}

export function buildScenarioSelectionEntryKey(
	opportunityId: string,
	endingSkuId: string,
): string {
	return `${opportunityId}::${endingSkuId}`;
}

export function serializeSelectionMap(
	selections: ScenarioSelectionMap,
	currency: string | null = null,
): string {
	const payload: StoragePayloadV5 = {
		version: STORAGE_VERSION,
		currency,
		entries: Array.from(selections.entries()),
	};

	return JSON.stringify(payload);
}

function toSelectionMapFromEntries(entries: unknown): ScenarioSelectionMap {
	if (!Array.isArray(entries)) {
		return new Map();
	}

	const map = new Map<string, ScenarioSelection>();
	for (const entry of entries) {
		if (!Array.isArray(entry) || entry.length !== 2) {
			continue;
		}

		const [, value] = entry;
		if (!isValidSelection(value)) {
			continue;
		}

		const selectionKey = buildScenarioSelectionEntryKey(
			value.opportunityId,
			value.endingSkuId,
		);
		map.set(selectionKey, value);
	}

	return map;
}

export function deserializeSelectionMap(
	rawValue: string | null,
): ScenarioSelectionMap {
	return deserializeSelectionEnvelope(rawValue).selections;
}

export function deserializeSelectionEnvelope(rawValue: string | null): {
	selections: ScenarioSelectionMap;
	currency: string | null;
} {
	if (!rawValue) return { selections: new Map(), currency: null };

	try {
		const payload = JSON.parse(rawValue) as Partial<
			| StoragePayloadV1
			| StoragePayloadV2
			| StoragePayloadV3
			| StoragePayloadV4
			| StoragePayloadV5
		>;

		if (!Array.isArray(payload.entries)) {
			return { selections: new Map(), currency: null };
		}

		if (
			payload.version === STORAGE_VERSION ||
			payload.version === 4 ||
			payload.version === 3 ||
			payload.version === 2 ||
			payload.version === 1
		) {
			const currency =
				payload.version === 5 && typeof payload.currency === 'string'
					? payload.currency
					: null;
			return {
				selections: toSelectionMapFromEntries(payload.entries),
				currency,
			};
		}

		return { selections: new Map(), currency: null };
	} catch {
		return { selections: new Map(), currency: null };
	}
}

export function sanitizeSelectionMap(
	selections: ScenarioSelectionMap,
	descriptors: Map<string, OpportunityDescriptor>,
): ScenarioSelectionMap {
	const sanitized = new Map<string, ScenarioSelection>();

	for (const selection of selections.values()) {
		const descriptor = descriptors.get(selection.opportunityId);
		if (!descriptor) continue;

		if (selection.startingSkuId !== descriptor.startingSkuId) continue;
		if (!descriptor.allowedEndingSkuIds.includes(selection.endingSkuId)) {
			continue;
		}

		const defaultSeats = Math.max(0, Math.floor(descriptor.maxSeats));
		const seats = clampSeats(
			selection.seats,
			SEAT_HARD_LIMIT,
			defaultSeats,
		);
		const selectionKey = buildScenarioSelectionEntryKey(
			selection.opportunityId,
			selection.endingSkuId,
		);

		sanitized.set(
			selectionKey,
			buildNormalizedSelection({
				selection,
				descriptor,
				seats,
			}),
		);
	}

	return normalizeOpportunityCurrentSkuPricing(sanitized);
}

function reduce(
	state: ScenarioSelectionState,
	action: Action,
): ScenarioSelectionState {
	switch (action.type) {
		case 'hydrate': {
			const sanitized = sanitizeSelectionMap(
				action.payload,
				action.descriptors,
			);
			if (state.hydrated && mapsEqual(state.selections, sanitized)) {
				return state;
			}
			return { selections: sanitized, hydrated: true };
		}

		case 'sanitize': {
			const sanitized = sanitizeSelectionMap(
				state.selections,
				action.descriptors,
			);
			if (mapsEqual(state.selections, sanitized)) return state;
			return { ...state, selections: sanitized };
		}

		case 'select': {
			const descriptor = action.descriptors.get(action.payload.opportunityId);
			if (!descriptor) return state;
			if (descriptor.startingSkuId !== action.payload.startingSkuId) {
				return state;
			}
			if (
				!descriptor.allowedEndingSkuIds.includes(action.payload.endingSkuId)
			) {
				return state;
			}

			const selectionKey = buildScenarioSelectionEntryKey(
				action.payload.opportunityId,
				action.payload.endingSkuId,
			);
			const existing = state.selections.get(selectionKey);
			const sharedCurrentPricing =
				getSharedCurrentSkuPricingForOpportunityFromSelections(
					state.selections.values(),
					action.payload.opportunityId,
				);
			const fallbackSeats =
				existing?.seats ?? Math.max(0, Math.floor(action.payload.defaultSeats));
			const seats = clampSeats(
				fallbackSeats,
				descriptor.maxSeats,
				Math.max(0, Math.floor(descriptor.maxSeats)),
			);

			const nextSelection = buildNormalizedSelection({
				selection: {
					opportunityId: action.payload.opportunityId,
					startingSkuId: descriptor.startingSkuId,
					endingSkuId: action.payload.endingSkuId,
					seats,
					...existing,
				},
				descriptor,
				seats,
				sharedCurrentSkuCustomerPrice:
					sharedCurrentPricing.currentSkuCustomerPrice,
				sharedCurrentSkuResellerPrice:
					sharedCurrentPricing.currentSkuResellerPrice,
				overrideCurrentSkuCustomerPrice: action.payload.currentSkuCustomerPrice,
				overrideCurrentSkuResellerPrice: action.payload.currentSkuResellerPrice,
				overrideTargetSkuCustomerPrice: action.payload.targetSkuCustomerPrice,
				overrideTargetSkuResellerPrice: action.payload.targetSkuResellerPrice,
				overrideTargetSkuPrice: action.payload.targetSkuPrice,
				overrideTargetSkuMarginPercent: action.payload.targetSkuMarginPercent,
			});

			const next = new Map(state.selections);
			next.set(selectionKey, nextSelection);

			const normalized = normalizeOpportunityCurrentSkuPricing(next);
			if (mapsEqual(state.selections, normalized)) return state;
			return { ...state, selections: normalized };
		}

		case 'deselect': {
			const selectionKey = buildScenarioSelectionEntryKey(
				action.payload.opportunityId,
				action.payload.endingSkuId,
			);
			if (!state.selections.has(selectionKey)) return state;
			const next = new Map(state.selections);
			next.delete(selectionKey);

			return {
				...state,
				selections: normalizeOpportunityCurrentSkuPricing(next),
			};
		}

		case 'updateSeats': {
			const selectionKey = buildScenarioSelectionEntryKey(
				action.payload.opportunityId,
				action.payload.endingSkuId,
			);
			const current = state.selections.get(selectionKey);
			if (!current) return state;

			const descriptor = action.descriptors.get(action.payload.opportunityId);
			if (!descriptor) return state;

			const seats = clampSeats(
				action.payload.seats,
				SEAT_HARD_LIMIT,
				current.seats,
			);
			if (seats === current.seats) return state;

			const next = new Map(state.selections);
			next.set(
				selectionKey,
				withLegacyDerivedPricing({
					...current,
					seats,
				}),
			);
			return { ...state, selections: next };
		}

		case 'updateCurrentSkuCustomerPrice':
		case 'updateExpiringSkuRenewalPrice':
		case 'updateCurrentSkuResellerPrice': {
			const selectionKey = buildScenarioSelectionEntryKey(
				action.payload.opportunityId,
				action.payload.endingSkuId,
			);
			const current = state.selections.get(selectionKey);
			if (!current) return state;

			const descriptor = action.descriptors.get(action.payload.opportunityId);
			if (!descriptor) return state;

			// Patch only the field the user touched. Do NOT route through
			// buildNormalizedSelection here — that would back-fill target SKU
			// prices from descriptor defaults and cause "Target Cost to Reseller"
			// to auto-populate when the user edits "Current Cost to Reseller".
			const nextValue =
				action.type === 'updateCurrentSkuCustomerPrice'
					? clampOptionalNonNegativeNumber(action.payload.currentSkuCustomerPrice)
					: action.type === 'updateCurrentSkuResellerPrice'
						? clampOptionalNonNegativeNumber(action.payload.currentSkuResellerPrice)
						: clampOptionalNonNegativeNumber(action.payload.expiringSkuRenewalPrice);

			const next = new Map(state.selections);
			for (const [key, selection] of next.entries()) {
				if (selection.opportunityId !== action.payload.opportunityId) {
					continue;
				}

				if (action.type === 'updateCurrentSkuCustomerPrice') {
					next.set(
						key,
						withLegacyDerivedPricing({
							...selection,
							currentSkuCustomerPrice: nextValue,
						}),
					);
					continue;
				}

				if (action.type === 'updateCurrentSkuResellerPrice') {
					next.set(
						key,
						withLegacyDerivedPricing({
							...selection,
							currentSkuResellerPrice: nextValue,
						}),
					);
					continue;
				}

				// updateExpiringSkuRenewalPrice — legacy field, mirror onto
				// currentSkuCustomerPrice via withLegacyDerivedPricing.
				next.set(
					key,
					withLegacyDerivedPricing({
						...selection,
						currentSkuCustomerPrice: nextValue,
					}),
				);
			}

			if (mapsEqual(state.selections, next)) return state;
			return { ...state, selections: next };
		}

		case 'resetSeats': {
			const selectionKey = buildScenarioSelectionEntryKey(
				action.payload.opportunityId,
				action.payload.endingSkuId,
			);
			const current = state.selections.get(selectionKey);
			if (!current) return state;

			const descriptor = action.descriptors.get(action.payload.opportunityId);
			if (!descriptor) return state;

			const seats = Math.max(0, Math.floor(descriptor.maxSeats));
			if (seats === current.seats) return state;

			const next = new Map(state.selections);
			next.set(
				selectionKey,
				withLegacyDerivedPricing({
					...current,
					seats,
				}),
			);
			return { ...state, selections: next };
		}

		case 'updateTargetSkuCustomerPrice':
		case 'updateTargetSkuPrice': {
			const selectionKey = buildScenarioSelectionEntryKey(
				action.payload.opportunityId,
				action.payload.endingSkuId,
			);
			const current = state.selections.get(selectionKey);
			if (!current) return state;

			const nextTargetSkuCustomerPrice = clampOptionalNonNegativeNumber(
				action.type === 'updateTargetSkuCustomerPrice'
					? action.payload.targetSkuCustomerPrice
					: action.payload.targetSkuPrice,
			);
			if (nextTargetSkuCustomerPrice === current.targetSkuCustomerPrice) {
				return state;
			}

			const next = new Map(state.selections);
			next.set(
				selectionKey,
				withLegacyDerivedPricing({
					...current,
					targetSkuCustomerPrice: nextTargetSkuCustomerPrice,
				}),
			);
			return { ...state, selections: next };
		}

		case 'updateTargetSkuResellerPrice': {
			const selectionKey = buildScenarioSelectionEntryKey(
				action.payload.opportunityId,
				action.payload.endingSkuId,
			);
			const current = state.selections.get(selectionKey);
			if (!current) return state;

			const nextTargetSkuResellerPrice = clampOptionalNonNegativeNumber(
				action.payload.targetSkuResellerPrice,
			);
			if (nextTargetSkuResellerPrice === current.targetSkuResellerPrice) {
				return state;
			}

			const next = new Map(state.selections);
			next.set(
				selectionKey,
				withLegacyDerivedPricing({
					...current,
					targetSkuResellerPrice: nextTargetSkuResellerPrice,
				}),
			);
			return { ...state, selections: next };
		}

		case 'updateTargetSkuMarginPercent': {
			const selectionKey = buildScenarioSelectionEntryKey(
				action.payload.opportunityId,
				action.payload.endingSkuId,
			);
			const current = state.selections.get(selectionKey);
			if (!current) return state;

			const nextTargetSkuMarginPercent = clampOptionalMargin(
				action.payload.targetSkuMarginPercent,
			);
			if (nextTargetSkuMarginPercent === undefined) {
				return state;
			}

			const next = new Map(state.selections);
			next.set(
				selectionKey,
				withLegacyDerivedPricing({
					...current,
					targetSkuResellerPrice: deriveResellerPriceFromMargin({
						customerPrice: current.targetSkuCustomerPrice ?? 0,
						marginPercent: nextTargetSkuMarginPercent,
					}),
				}),
			);
			return { ...state, selections: next };
		}

		case 'resetPricesForCurrency': {
			if (state.selections.size === 0) return state;
			const next = new Map(state.selections);
			let mutated = false;
			for (const [key, selection] of next) {
				const descriptor = action.descriptors.get(selection.opportunityId);
				if (!descriptor) continue;
				const targetDefaults = getTargetSkuPricingDefaults(
					descriptor,
					selection.endingSkuId,
				);
				const currentSkuCustomerPrice = descriptor.currentSkuCustomerPrice;
				const currentSkuResellerPrice = 0;
				const targetSkuCustomerPrice = targetDefaults.targetSkuCustomerPrice;
				const targetSkuMarginPercent = targetDefaults.targetSkuMarginPercent;
				const targetSkuResellerPrice = deriveResellerPriceFromMargin({
					customerPrice: targetSkuCustomerPrice,
					marginPercent: targetSkuMarginPercent,
				});
				const updated: ScenarioSelection = withLegacyDerivedPricing({
					...selection,
					currentSkuCustomerPrice,
					currentSkuResellerPrice,
					targetSkuCustomerPrice,
					targetSkuResellerPrice,
					targetSkuMarginPercent,
				});
				if (
					updated.currentSkuCustomerPrice !== selection.currentSkuCustomerPrice ||
					updated.currentSkuResellerPrice !== selection.currentSkuResellerPrice ||
					updated.targetSkuCustomerPrice !== selection.targetSkuCustomerPrice ||
					updated.targetSkuResellerPrice !== selection.targetSkuResellerPrice ||
					updated.targetSkuPrice !== selection.targetSkuPrice ||
					updated.expiringSkuRenewalPrice !== selection.expiringSkuRenewalPrice ||
					updated.targetSkuMarginPercent !== selection.targetSkuMarginPercent
				) {
					next.set(key, updated);
					mutated = true;
				}
			}
			if (!mutated) return state;
			return { ...state, selections: next };
		}

		case 'clear':
			if (state.selections.size === 0) return state;
			return { ...state, selections: new Map() };

		default:
			return state;
	}
}

interface UseScenarioSelectionArgs {
	customerId: string;
	descriptors: Map<string, OpportunityDescriptor>;
	currency?: string | null;
}

export function useScenarioSelection({
	customerId,
	descriptors,
	currency = null,
}: UseScenarioSelectionArgs) {
	const [state, dispatch] = useReducer(reduce, {
		selections: new Map(),
		hydrated: false,
	});

	const storageKey = useMemo(
		() => buildScenarioSelectionStorageKey(customerId),
		[customerId],
	);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (descriptors.size === 0) return;
		if (state.hydrated) return;
		const raw = window.sessionStorage.getItem(storageKey);
		const { selections: parsed, currency: storedCurrency } =
			deserializeSelectionEnvelope(raw);
		dispatch({ type: 'hydrate', payload: parsed, descriptors });
		// If stored selections were written under a different currency, reset
		// each price input to the new currency's defaults (current SKU reseller
		// price → 0; target SKU reseller price → derived from margin × default
		// customer price). No cross-currency conversion is applied.
		if (storedCurrency && currency && storedCurrency !== currency) {
			dispatch({ type: 'resetPricesForCurrency', descriptors });
		}
	}, [state.hydrated, storageKey, descriptors, currency]);

	useEffect(() => {
		if (!state.hydrated) return;
		dispatch({ type: 'sanitize', descriptors });
	}, [descriptors, state.hydrated]);

	useEffect(() => {
		if (typeof window === 'undefined' || !state.hydrated) return;
		window.sessionStorage.setItem(
			storageKey,
			serializeSelectionMap(state.selections, currency),
		);
	}, [storageKey, state.selections, state.hydrated, currency]);

	const selectScenario = useCallback(
		(
			opportunityId: string,
			startingSkuId: string,
			endingSkuId: string,
			defaultSeats: number,
			options?: {
				currentSkuCustomerPrice?: unknown;
				currentSkuResellerPrice?: unknown;
				targetSkuCustomerPrice?: unknown;
				targetSkuResellerPrice?: unknown;
				targetSkuPrice?: unknown;
				targetSkuMarginPercent?: unknown;
			},
		) => {
			dispatch({
				type: 'select',
				payload: {
					opportunityId,
					startingSkuId,
					endingSkuId,
					defaultSeats,
					currentSkuCustomerPrice: options?.currentSkuCustomerPrice,
					currentSkuResellerPrice: options?.currentSkuResellerPrice,
					targetSkuCustomerPrice: options?.targetSkuCustomerPrice,
					targetSkuResellerPrice: options?.targetSkuResellerPrice,
					targetSkuPrice: options?.targetSkuPrice,
					targetSkuMarginPercent: options?.targetSkuMarginPercent,
				},
				descriptors,
			});
		},
		[descriptors],
	);

	const deselectScenario = useCallback(
		(opportunityId: string, endingSkuId: string) => {
			dispatch({
				type: 'deselect',
				payload: { opportunityId, endingSkuId },
				descriptors,
			});
		},
		[descriptors],
	);

	const updateSeats = useCallback(
		(opportunityId: string, endingSkuId: string, seats: unknown) => {
			dispatch({
				type: 'updateSeats',
				payload: { opportunityId, endingSkuId, seats },
				descriptors,
			});
		},
		[descriptors],
	);

	const updateCurrentSkuCustomerPrice = useCallback(
		(
			opportunityId: string,
			endingSkuId: string,
			currentSkuCustomerPrice: unknown,
		) => {
			dispatch({
				type: 'updateCurrentSkuCustomerPrice',
				payload: {
					opportunityId,
					endingSkuId,
					currentSkuCustomerPrice,
				},
				descriptors,
			});
		},
		[descriptors],
	);

	const updateCurrentSkuResellerPrice = useCallback(
		(
			opportunityId: string,
			endingSkuId: string,
			currentSkuResellerPrice: unknown,
		) => {
			dispatch({
				type: 'updateCurrentSkuResellerPrice',
				payload: {
					opportunityId,
					endingSkuId,
					currentSkuResellerPrice,
				},
				descriptors,
			});
		},
		[descriptors],
	);

	const updateExpiringSkuRenewalPrice = useCallback(
		(
			opportunityId: string,
			endingSkuId: string,
			expiringSkuRenewalPrice: unknown,
		) => {
			dispatch({
				type: 'updateExpiringSkuRenewalPrice',
				payload: {
					opportunityId,
					endingSkuId,
					expiringSkuRenewalPrice,
				},
				descriptors,
			});
		},
		[descriptors],
	);

	const updateTargetSkuCustomerPrice = useCallback(
		(
			opportunityId: string,
			endingSkuId: string,
			targetSkuCustomerPrice: unknown,
		) => {
			dispatch({
				type: 'updateTargetSkuCustomerPrice',
				payload: { opportunityId, endingSkuId, targetSkuCustomerPrice },
			});
		},
		[],
	);

	const updateTargetSkuResellerPrice = useCallback(
		(
			opportunityId: string,
			endingSkuId: string,
			targetSkuResellerPrice: unknown,
		) => {
			dispatch({
				type: 'updateTargetSkuResellerPrice',
				payload: { opportunityId, endingSkuId, targetSkuResellerPrice },
			});
		},
		[],
	);

	const updateTargetSkuPrice = useCallback(
		(opportunityId: string, endingSkuId: string, targetSkuPrice: unknown) => {
			dispatch({
				type: 'updateTargetSkuPrice',
				payload: { opportunityId, endingSkuId, targetSkuPrice },
			});
		},
		[],
	);

	const updateTargetSkuMarginPercent = useCallback(
		(
			opportunityId: string,
			endingSkuId: string,
			targetSkuMarginPercent: unknown,
		) => {
			dispatch({
				type: 'updateTargetSkuMarginPercent',
				payload: { opportunityId, endingSkuId, targetSkuMarginPercent },
			});
		},
		[],
	);

	const resetSeats = useCallback(
		(opportunityId: string, endingSkuId: string) => {
			dispatch({
				type: 'resetSeats',
				payload: { opportunityId, endingSkuId },
				descriptors,
			});
		},
		[descriptors],
	);

	const clearSelections = useCallback(() => {
		dispatch({ type: 'clear' });
	}, []);

	const resetPricesForCurrency = useCallback(() => {
		dispatch({ type: 'resetPricesForCurrency', descriptors });
	}, [descriptors]);

	const getSelection = useCallback(
		(opportunityId: string, endingSkuId: string) =>
			state.selections.get(
				buildScenarioSelectionEntryKey(opportunityId, endingSkuId),
			),
		[state.selections],
	);

	const getSelectionsForOpportunity = useCallback(
		(opportunityId: string) =>
			Array.from(state.selections.values()).filter(
				(selection) => selection.opportunityId === opportunityId,
			),
		[state.selections],
	);

	const getSharedRenewalPriceForOpportunity = useCallback(
		(opportunityId: string) =>
			getSharedCurrentSkuPricingForOpportunityFromSelections(
				state.selections.values(),
				opportunityId,
			).currentSkuCustomerPrice,
		[state.selections],
	);

	return {
		hydrated: state.hydrated,
		selections: state.selections,
		selectedCount: state.selections.size,
		hasSelections: state.selections.size > 0,
		getSelection,
		getSelectionsForOpportunity,
		getSharedRenewalPriceForOpportunity,
		selectScenario,
		deselectScenario,
		updateSeats,
		updateCurrentSkuCustomerPrice,
		updateCurrentSkuResellerPrice,
		updateExpiringSkuRenewalPrice,
		updateTargetSkuCustomerPrice,
		updateTargetSkuResellerPrice,
		updateTargetSkuPrice,
		updateTargetSkuMarginPercent,
		resetSeats,
		clearSelections,
		resetPricesForCurrency,
	};
}
