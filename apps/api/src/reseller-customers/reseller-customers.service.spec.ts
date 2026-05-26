import { describe, expect, it } from 'vitest';
import {
	resolveResellerCurrentArrBucketRange,
	type NumericBucketRange,
} from './reseller-customers.service';

function matchesRange(value: number, range: NumericBucketRange): boolean {
	if (typeof range.min === 'number') {
		if (range.minInclusive ? value < range.min : value <= range.min) {
			return false;
		}
	}

	if (typeof range.max === 'number') {
		if (range.maxInclusive ? value > range.max : value >= range.max) {
			return false;
		}
	}

	return true;
}

describe('resolveResellerCurrentArrBucketRange', () => {
	it('matches values below 100000 for the first bucket', () => {
		const range = resolveResellerCurrentArrBucketRange('<$100,000');

		expect(range).not.toBeNull();
		expect(matchesRange(99_999.99, range!)).toBe(true);
		expect(matchesRange(100_000, range!)).toBe(false);
	});

	it('includes both 100000 and 200000 in the middle bucket', () => {
		const range = resolveResellerCurrentArrBucketRange('$100,000-$200,000');

		expect(range).not.toBeNull();
		expect(matchesRange(99_999.99, range!)).toBe(false);
		expect(matchesRange(100_000, range!)).toBe(true);
		expect(matchesRange(200_000, range!)).toBe(true);
		expect(matchesRange(200_000.01, range!)).toBe(false);
	});

	it('starts above 200000 and includes 500000 in the upper-middle bucket', () => {
		const range = resolveResellerCurrentArrBucketRange('$200,000-$500,000');

		expect(range).not.toBeNull();
		expect(matchesRange(200_000, range!)).toBe(false);
		expect(matchesRange(200_000.01, range!)).toBe(true);
		expect(matchesRange(500_000, range!)).toBe(true);
		expect(matchesRange(500_000.01, range!)).toBe(false);
	});

	it('starts above 500000 for the final bucket', () => {
		const range = resolveResellerCurrentArrBucketRange('>$500,000');

		expect(range).not.toBeNull();
		expect(matchesRange(500_000, range!)).toBe(false);
		expect(matchesRange(500_000.01, range!)).toBe(true);
	});

	it('returns null for unknown bucket labels', () => {
		expect(resolveResellerCurrentArrBucketRange('unknown')).toBeNull();
	});
});
