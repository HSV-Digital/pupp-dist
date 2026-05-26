import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { OpportunityDescriptor } from '@/lib/opportunity-utils';
import {
	buildScenarioSelectionEntryKey,
	buildScenarioSelectionStorageKey,
	deserializeSelectionMap,
	sanitizeSelectionMap,
	serializeSelectionMap,
	useScenarioSelection,
} from './use-scenario-selection';

const CUSTOMER_ID = 'cust-100';
const OPPORTUNITY_ID = 'cust-100:sub-1';
const OPPORTUNITY_TWO_ID = 'cust-100:sub-2';

function makeDescriptors(): Map<string, OpportunityDescriptor> {
	return new Map([
		[
			OPPORTUNITY_ID,
			{
				opportunityId: OPPORTUNITY_ID,
				startingSkuId: 'bb',
				allowedEndingSkuIds: ['bs_cb', 'bp_cb'],
				maxSeats: 120,
			},
		],
		[
			OPPORTUNITY_TWO_ID,
			{
				opportunityId: OPPORTUNITY_TWO_ID,
				startingSkuId: 'bs',
				allowedEndingSkuIds: ['bs_cb'],
				maxSeats: 80,
			},
		],
	]);
}

describe('scenario selection serialization', () => {
	it('round-trips a selection map', () => {
		const map = new Map([
			[
				buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb'),
				{
					opportunityId: OPPORTUNITY_ID,
					startingSkuId: 'bb',
					endingSkuId: 'bp_cb',
					seats: 50,
					expiringSkuRenewalPrice: 12.5,
					targetSkuPrice: 27.25,
					targetSkuMarginPercent: 22.5,
				},
			],
		]);

		const raw = serializeSelectionMap(map);
		const parsed = deserializeSelectionMap(raw);

		expect(
			parsed.get(buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb')),
		).toEqual(map.get(buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb')));
	});

	it('migrates legacy v1 payloads keyed by opportunity id', () => {
		const parsed = deserializeSelectionMap(
			JSON.stringify({
				version: 1,
				entries: [
					[
						OPPORTUNITY_ID,
						{
							opportunityId: OPPORTUNITY_ID,
							startingSkuId: 'bb',
							endingSkuId: 'bp_cb',
							seats: 35,
							expiringSkuRenewalPrice: 13.75,
						},
					],
				],
			}),
		);

		expect(parsed.size).toBe(1);
		expect(
			parsed.get(buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb')),
		).toEqual({
			opportunityId: OPPORTUNITY_ID,
			startingSkuId: 'bb',
			endingSkuId: 'bp_cb',
			seats: 35,
			expiringSkuRenewalPrice: 13.75,
		});
	});

	it('returns empty map for malformed payloads', () => {
		expect(deserializeSelectionMap('not-json').size).toBe(0);
		expect(
			deserializeSelectionMap(JSON.stringify({ version: 999, entries: [] }))
				.size,
		).toBe(0);
	});
});

describe('sanitizeSelectionMap', () => {
	it('drops stale/invalid entries and clamps seats', () => {
		const descriptors = makeDescriptors();
		const selections = new Map([
			[
				buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb'),
				{
					opportunityId: OPPORTUNITY_ID,
					startingSkuId: 'bb',
					endingSkuId: 'bp_cb',
					seats: 999,
					expiringSkuRenewalPrice: -10,
				},
			],
			[
				buildScenarioSelectionEntryKey('missing-opportunity', 'bp_cb'),
				{
					opportunityId: 'missing-opportunity',
					startingSkuId: 'bb',
					endingSkuId: 'bp_cb',
					seats: 10,
				},
			],
			[
				buildScenarioSelectionEntryKey(OPPORTUNITY_TWO_ID, 'bs_cb'),
				{
					opportunityId: OPPORTUNITY_TWO_ID,
					startingSkuId: 'wrong',
					endingSkuId: 'bs_cb',
					seats: 10,
				},
			],
		]);

		const sanitized = sanitizeSelectionMap(selections, descriptors);
		expect(sanitized.size).toBe(1);
		expect(
			sanitized.get(buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb')),
		).toEqual(
			expect.objectContaining({
				opportunityId: OPPORTUNITY_ID,
				startingSkuId: 'bb',
				endingSkuId: 'bp_cb',
				seats: 120,
				expiringSkuRenewalPrice: 0,
				currentSkuCustomerPrice: 0,
				currentSkuResellerPrice: 0,
			}),
		);
	});

	it('normalizes renewal price across selections from the same opportunity', () => {
		const descriptors = makeDescriptors();
		const selections = new Map([
			[
				buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb'),
				{
					opportunityId: OPPORTUNITY_ID,
					startingSkuId: 'bb',
					endingSkuId: 'bp_cb',
					seats: 60,
					expiringSkuRenewalPrice: 15,
				},
			],
			[
				buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bs_cb'),
				{
					opportunityId: OPPORTUNITY_ID,
					startingSkuId: 'bb',
					endingSkuId: 'bs_cb',
					seats: 60,
				},
			],
		]);

		const sanitized = sanitizeSelectionMap(selections, descriptors);
		expect(
			sanitized.get(buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb')),
		).toEqual(
			expect.objectContaining({
				expiringSkuRenewalPrice: 15,
			}),
		);
		expect(
			sanitized.get(buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bs_cb')),
		).toEqual(
			expect.objectContaining({
				expiringSkuRenewalPrice: 15,
			}),
		);
	});
});

describe('useScenarioSelection', () => {
	beforeEach(() => {
		window.sessionStorage.clear();
	});

	it('hydrates from sessionStorage and exposes selection state', async () => {
		const descriptors = makeDescriptors();
		const key = buildScenarioSelectionStorageKey(CUSTOMER_ID);

		window.sessionStorage.setItem(
			key,
			JSON.stringify({
				version: 2,
				entries: [
					[
						buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bs_cb'),
						{
							opportunityId: OPPORTUNITY_ID,
							startingSkuId: 'bb',
							endingSkuId: 'bs_cb',
							seats: 40,
							expiringSkuRenewalPrice: 18.25,
						},
					],
				],
			}),
		);

		const { result } = renderHook(() =>
			useScenarioSelection({
				customerId: CUSTOMER_ID,
				descriptors,
			}),
		);

		await waitFor(() => expect(result.current.hydrated).toBe(true));
		expect(result.current.selectedCount).toBe(1);
		expect(
			result.current.getSelection(OPPORTUNITY_ID, 'bs_cb')?.endingSkuId,
		).toBe('bs_cb');
		expect(
			result.current.getSelection(OPPORTUNITY_ID, 'bs_cb')
				?.expiringSkuRenewalPrice,
		).toBe(18.25);
		expect(
			result.current.getSharedRenewalPriceForOpportunity(OPPORTUNITY_ID),
		).toBe(18.25);
	});

	it('normalizes conflicting stored renewal prices to one shared opportunity value', async () => {
		const descriptors = makeDescriptors();
		const key = buildScenarioSelectionStorageKey(CUSTOMER_ID);

		window.sessionStorage.setItem(
			key,
			JSON.stringify({
				version: 3,
				entries: [
					[
						buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bp_cb'),
						{
							opportunityId: OPPORTUNITY_ID,
							startingSkuId: 'bb',
							endingSkuId: 'bp_cb',
							seats: 60,
							expiringSkuRenewalPrice: 18.25,
						},
					],
					[
						buildScenarioSelectionEntryKey(OPPORTUNITY_ID, 'bs_cb'),
						{
							opportunityId: OPPORTUNITY_ID,
							startingSkuId: 'bb',
							endingSkuId: 'bs_cb',
							seats: 60,
							expiringSkuRenewalPrice: 21.5,
						},
					],
				],
			}),
		);

		const { result } = renderHook(() =>
			useScenarioSelection({
				customerId: CUSTOMER_ID,
				descriptors,
			}),
		);

		await waitFor(() => expect(result.current.hydrated).toBe(true));
		expect(
			result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')
				?.expiringSkuRenewalPrice,
		).toBe(18.25);
		expect(
			result.current.getSelection(OPPORTUNITY_ID, 'bs_cb')
				?.expiringSkuRenewalPrice,
		).toBe(18.25);
	});

	it('selects multiple scenarios, updates, resets and clears scenarios', async () => {
		const descriptors = makeDescriptors();
		const key = buildScenarioSelectionStorageKey(CUSTOMER_ID);

		const { result } = renderHook(() =>
			useScenarioSelection({
				customerId: CUSTOMER_ID,
				descriptors,
			}),
		);

		await waitFor(() => expect(result.current.hydrated).toBe(true));

		act(() => {
			result.current.selectScenario(OPPORTUNITY_ID, 'bb', 'bp_cb', 95);
			result.current.selectScenario(OPPORTUNITY_ID, 'bb', 'bs_cb', 30);
		});
		expect(result.current.selectedCount).toBe(2);
		// Each selection keeps its own seat count (sourced from the DB-derived
		// default at selection time). The user can edit them separately —
		// selecting a sibling does not redistribute existing seats.
		expect(result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')?.seats).toBe(
			95,
		);
		expect(result.current.getSelection(OPPORTUNITY_ID, 'bs_cb')?.seats).toBe(
			30,
		);

		act(() => {
			result.current.updateSeats(OPPORTUNITY_ID, 'bp_cb', 500);
		});
		expect(result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')?.seats).toBe(
			120,
		);

		act(() => {
			result.current.updateExpiringSkuRenewalPrice(
				OPPORTUNITY_ID,
				'bp_cb',
				21.5,
			);
		});
		expect(
			result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')
				?.expiringSkuRenewalPrice,
		).toBe(21.5);
		expect(
			result.current.getSelection(OPPORTUNITY_ID, 'bs_cb')
				?.expiringSkuRenewalPrice,
		).toBe(21.5);
		expect(
			result.current.getSharedRenewalPriceForOpportunity(OPPORTUNITY_ID),
		).toBe(21.5);

		act(() => {
			result.current.updateSeats(OPPORTUNITY_ID, 'bp_cb', -4);
		});
		expect(result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')?.seats).toBe(0);

		act(() => {
			result.current.resetSeats(OPPORTUNITY_ID, 'bp_cb');
		});
		expect(result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')?.seats).toBe(
			120,
		);

		act(() => {
			result.current.deselectScenario(OPPORTUNITY_ID, 'bs_cb');
		});
		expect(result.current.selectedCount).toBe(1);

		act(() => {
			result.current.clearSelections();
		});
		expect(result.current.selectedCount).toBe(0);
		expect(
			deserializeSelectionMap(window.sessionStorage.getItem(key)).size,
		).toBe(0);
	});

	it('stores target price and margin per selected ending sku', async () => {
		const descriptors = makeDescriptors();

		const { result } = renderHook(() =>
			useScenarioSelection({
				customerId: CUSTOMER_ID,
				descriptors,
			}),
		);

		await waitFor(() => expect(result.current.hydrated).toBe(true));

		act(() => {
			result.current.selectScenario(OPPORTUNITY_ID, 'bb', 'bp_cb', 95, {
				targetSkuPrice: 28.5,
				targetSkuMarginPercent: 24.25,
			});
			result.current.selectScenario(OPPORTUNITY_ID, 'bb', 'bs_cb', 25, {
				targetSkuPrice: 19.75,
				targetSkuMarginPercent: 18.5,
			});
		});

		expect(result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')).toEqual(
			expect.objectContaining({
				targetSkuPrice: 28.5,
				targetSkuMarginPercent: 24.25,
				targetSkuCustomerPrice: 28.5,
				targetSkuResellerPrice: 21.59,
			}),
		);
		expect(result.current.getSelection(OPPORTUNITY_ID, 'bs_cb')).toEqual(
			expect.objectContaining({
				targetSkuPrice: 19.75,
				targetSkuMarginPercent: 18.48,
				targetSkuCustomerPrice: 19.75,
				targetSkuResellerPrice: 16.1,
			}),
		);

		act(() => {
			result.current.updateTargetSkuPrice(OPPORTUNITY_ID, 'bp_cb', 31.5);
			result.current.updateTargetSkuMarginPercent(
				OPPORTUNITY_ID,
				'bs_cb',
				17.25,
			);
		});

		expect(result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')).toEqual(
			expect.objectContaining({
				targetSkuPrice: 31.5,
				targetSkuMarginPercent: 31.46,
				targetSkuCustomerPrice: 31.5,
				targetSkuResellerPrice: 21.59,
			}),
		);
		expect(result.current.getSelection(OPPORTUNITY_ID, 'bs_cb')).toEqual(
			expect.objectContaining({
				targetSkuPrice: 19.75,
				targetSkuMarginPercent: 17.27,
				targetSkuCustomerPrice: 19.75,
				targetSkuResellerPrice: 16.34,
			}),
		);
	});

	it('inherits the shared renewal price when a sibling scenario is selected later', async () => {
		const descriptors = makeDescriptors();

		const { result } = renderHook(() =>
			useScenarioSelection({
				customerId: CUSTOMER_ID,
				descriptors,
			}),
		);

		await waitFor(() => expect(result.current.hydrated).toBe(true));

		act(() => {
			result.current.selectScenario(OPPORTUNITY_ID, 'bb', 'bp_cb', 95);
			result.current.updateExpiringSkuRenewalPrice(
				OPPORTUNITY_ID,
				'bp_cb',
				19.75,
			);
			result.current.selectScenario(OPPORTUNITY_ID, 'bb', 'bs_cb', 30);
		});

		expect(
			result.current.getSelection(OPPORTUNITY_ID, 'bp_cb')
				?.expiringSkuRenewalPrice,
		).toBe(19.75);
		expect(
			result.current.getSelection(OPPORTUNITY_ID, 'bs_cb')
				?.expiringSkuRenewalPrice,
		).toBe(19.75);
	});

	it('ignores corrupted stored selections and invalid select attempts', async () => {
		const descriptors = makeDescriptors();
		const key = buildScenarioSelectionStorageKey(CUSTOMER_ID);

		window.sessionStorage.setItem(
			key,
			JSON.stringify({
				version: 2,
				entries: [['bad', { opportunityId: 'bad', startingSkuId: 'x' }]],
			}),
		);

		const { result } = renderHook(() =>
			useScenarioSelection({
				customerId: CUSTOMER_ID,
				descriptors,
			}),
		);

		await waitFor(() => expect(result.current.hydrated).toBe(true));
		expect(result.current.selectedCount).toBe(0);

		act(() => {
			result.current.selectScenario(OPPORTUNITY_ID, 'wrong', 'bp_cb', 20);
			result.current.selectScenario(OPPORTUNITY_ID, 'bb', 'invalid-ending', 20);
		});

		expect(result.current.selectedCount).toBe(0);
	});
});
