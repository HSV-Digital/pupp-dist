import { SeatRange, type SeatRangeValue, ZERO_SEAT_RANGE } from '@repo/types';

export const SEAT_RANGE_ORDER = [
	SeatRange.Seats1To24,
	SeatRange.Seats25To49,
	SeatRange.Seats50To99,
	SeatRange.Seats100To299,
	SeatRange.Seats300To499,
	SeatRange.Seats500To999,
	SeatRange.Seats1000Plus,
] as const;

const estimatedSeatCountFormatter = new Intl.NumberFormat('en-US', {
	notation: 'compact',
	maximumFractionDigits: 1,
});

export function toSeatRange(value: number): SeatRangeValue {
	const normalized = Math.max(
		0,
		Math.floor(Number.isFinite(value) ? value : 0),
	);

	if (normalized === 0) return ZERO_SEAT_RANGE;
	if (normalized <= 24) return SeatRange.Seats1To24;
	if (normalized <= 49) return SeatRange.Seats25To49;
	if (normalized <= 99) return SeatRange.Seats50To99;
	if (normalized <= 299) return SeatRange.Seats100To299;
	if (normalized <= 499) return SeatRange.Seats300To499;
	if (normalized <= 999) return SeatRange.Seats500To999;
	return SeatRange.Seats1000Plus;
}

export function getSeatRangeLowerBound(value: SeatRangeValue): number {
	switch (value) {
		case ZERO_SEAT_RANGE:
			return 0;
		case SeatRange.Seats1To24:
			return 1;
		case SeatRange.Seats25To49:
			return 25;
		case SeatRange.Seats50To99:
			return 50;
		case SeatRange.Seats100To299:
			return 100;
		case SeatRange.Seats300To499:
			return 300;
		case SeatRange.Seats500To999:
			return 500;
		case SeatRange.Seats1000Plus:
			return 1000;
	}
}

export function compareSeatRanges(
	left: SeatRangeValue,
	right: SeatRangeValue,
): number {
	return getSeatRangeLowerBound(left) - getSeatRangeLowerBound(right);
}

export function formatEstimatedSeatCount(value: number): string {
	const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
	return estimatedSeatCountFormatter.format(normalized).replace('K', 'k');
}
