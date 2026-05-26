import { toStringArray } from './query-normalizers';

describe('toStringArray', () => {
	it('returns trimmed non-empty values for arrays', () => {
		expect(toStringArray(['  a  ', '', 'b', 4])).toEqual(['a', 'b', '4']);
	});

	it('returns single trimmed value for strings', () => {
		expect(toStringArray('  alpha  ')).toEqual(['alpha']);
	});

	it('returns empty array for empty string', () => {
		expect(toStringArray('   ')).toEqual([]);
	});

	it('returns empty array for unsupported input', () => {
		expect(toStringArray(null)).toEqual([]);
		expect(toStringArray(undefined)).toEqual([]);
		expect(toStringArray(10)).toEqual([]);
	});
});
