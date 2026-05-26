export interface ScenarioAllocationInput {
	key: string;
	selectedSeats: number;
}

export interface ScenarioAllocation {
	key: string;
	selectedSeats: number;
	ratio: number;
	allocatedOriginalSeats: number;
	allocatedExpiringArr: number;
}

interface NormalizedAllocationInput {
	key: string;
	selectedSeats: number;
	index: number;
}

function toNormalizedSeats(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.floor(value));
}

function toRoundedCents(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.round((value + Number.EPSILON) * 100));
}

function distributeIntegerByRatio(params: {
	total: number;
	ratios: number[];
}): number[] {
	const total = Math.max(0, Math.floor(params.total));
	if (params.ratios.length === 0) return [];

	const rows = params.ratios.map((ratio, index) => {
		const safeRatio = Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
		const scaled = total * safeRatio;
		const floorValue = Math.floor(scaled);
		return {
			index,
			floorValue,
			remainder: scaled - floorValue,
		};
	});

	let remaining = total - rows.reduce((sum, row) => sum + row.floorValue, 0);
	const sorted = [...rows].sort((left, right) => {
		if (right.remainder !== left.remainder) {
			return right.remainder - left.remainder;
		}
		return left.index - right.index;
	});

	for (let i = 0; i < sorted.length && remaining > 0; i += 1) {
		const row = sorted[i];
		if (!row) continue;
		row.floorValue += 1;
		remaining -= 1;
	}

	const allocated = Array<number>(rows.length).fill(0);
	for (const row of sorted) {
		allocated[row.index] = row.floorValue;
	}
	return allocated;
}

/**
 * Splits baseline original seats and expiring ARR proportionally based on selected seats.
 * When all selected seats are zero, falls back to equal distribution.
 */
export function allocateScenarioBaselines(params: {
	startingSeats: number;
	expiringArr: number;
	selections: ScenarioAllocationInput[];
}): ScenarioAllocation[] {
	const normalizedStartingSeats = toNormalizedSeats(params.startingSeats);
	const normalizedExpiringArrCents = toRoundedCents(params.expiringArr);
	const normalizedSelections: NormalizedAllocationInput[] = params.selections.map(
		(selection, index) => ({
			key: selection.key,
			selectedSeats: toNormalizedSeats(selection.selectedSeats),
			index,
		}),
	);

	if (normalizedSelections.length === 0) {
		return [];
	}

	const totalSelectedSeats = normalizedSelections.reduce(
		(sum, selection) => sum + selection.selectedSeats,
		0,
	);

	const equalRatio = 1 / normalizedSelections.length;
	const ratios = normalizedSelections.map((selection) =>
		totalSelectedSeats > 0 ? selection.selectedSeats / totalSelectedSeats : equalRatio,
	);

	const allocatedStartingSeats = distributeIntegerByRatio({
		total: normalizedStartingSeats,
		ratios,
	});
	const allocatedExpiringArrCents = distributeIntegerByRatio({
		total: normalizedExpiringArrCents,
		ratios,
	});

	return normalizedSelections
		.sort((left, right) => left.index - right.index)
		.map((selection, index) => ({
			key: selection.key,
			selectedSeats: selection.selectedSeats,
			ratio: ratios[index] ?? 0,
			allocatedOriginalSeats: allocatedStartingSeats[index] ?? 0,
			allocatedExpiringArr: (allocatedExpiringArrCents[index] ?? 0) / 100,
		}));
}
