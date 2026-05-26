import {
	resolveDashboardIncludePlan,
	resolveDashboardOptionsLimit,
	resolveDashboardOptionsSearchLimit,
} from './dashboard.service';

describe('resolveDashboardIncludePlan', () => {
	it('returns full payload by default', () => {
		expect(resolveDashboardIncludePlan({})).toEqual({
			rows: true,
			summary: true,
			options: true,
			requestedParts: ['rows', 'summary', 'options'],
		});
	});

	it('keeps legacy include=rows behavior', () => {
		expect(resolveDashboardIncludePlan({ include: 'rows' })).toEqual({
			rows: true,
			summary: false,
			options: false,
			requestedParts: ['rows'],
		});
	});

	it('resolves include parts from includeParts query value', () => {
		expect(
			resolveDashboardIncludePlan({
				include: 'rows',
				includeParts: 'rows,summary',
			}),
		).toEqual({
			rows: true,
			summary: true,
			options: false,
			requestedParts: ['rows', 'summary'],
		});
	});

	it('ignores invalid include parts and falls back to legacy include', () => {
		expect(
			resolveDashboardIncludePlan({
				include: 'rows',
				includeParts: 'unknown-value',
			}),
		).toEqual({
			rows: true,
			summary: false,
			options: false,
			requestedParts: ['rows'],
		});
	});
});

describe('resolveDashboardOptionsLimit', () => {
	it('returns default when omitted', () => {
		expect(resolveDashboardOptionsLimit(undefined)).toBe(200);
	});

	it('returns bounded integer value', () => {
		expect(resolveDashboardOptionsLimit(25.8)).toBe(25);
	});

	it('caps limit to max value', () => {
		expect(resolveDashboardOptionsLimit(2_000)).toBe(500);
	});

	it('enforces minimum bound', () => {
		expect(resolveDashboardOptionsLimit(0)).toBe(200);
	});
});

describe('resolveDashboardOptionsSearchLimit', () => {
	it('returns default when omitted', () => {
		expect(resolveDashboardOptionsSearchLimit(undefined)).toBe(50);
	});

	it('returns bounded integer value', () => {
		expect(resolveDashboardOptionsSearchLimit(23.9)).toBe(23);
	});

	it('caps limit to max value', () => {
		expect(resolveDashboardOptionsSearchLimit(2_000)).toBe(100);
	});

	it('enforces minimum bound', () => {
		expect(resolveDashboardOptionsSearchLimit(0)).toBe(50);
	});
});
