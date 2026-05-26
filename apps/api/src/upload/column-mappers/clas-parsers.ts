const MONTHS: Record<string, number> = {
	january: 1,
	february: 2,
	march: 3,
	april: 4,
	may: 5,
	june: 6,
	july: 7,
	august: 8,
	september: 9,
	october: 10,
	november: 11,
	december: 12,
};

/**
 * Parses an "Org Size" range cell into a single licenses-count number.
 *
 *   "0-4"     → 4    (lower bound 0 → use upper bound)
 *   "25-49"   → 25
 *   "50-99"   → 50
 *   "100-299" → 100
 *   "300-500" → 300
 *   "2500+"   → undefined  (open-ended; not parseable)
 *
 * Big-org rows are still stored. Visibility is enforced separately by the
 * dashboard_visible flag in the subscription processor.
 */
export function parseOrgSize(value: string | undefined): number | undefined {
	const range = parseOrgSizeRange(value);
	if (!range) return undefined;
	return range.lower === 0 ? range.upper : range.lower;
}

/**
 * Parses an "Org Size" range cell into its lower/upper bounds. Returns
 * undefined for non-range or malformed values.
 */
export function parseOrgSizeRange(
	value: string | undefined,
): { lower: number; upper: number } | undefined {
	if (!value) return undefined;
	const match = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
	if (!match) return undefined;
	const lower = parseInt(match[1], 10);
	const upper = parseInt(match[2], 10);
	if (!Number.isFinite(lower) || !Number.isFinite(upper)) return undefined;
	return { lower, upper };
}

/**
 * Parses a "MW CSP Annual Renewal" cell ("(April, 2026)") into an ISO date
 * string ("2026-04-01") using day = 1.
 */
export function parseRenewalMonthYear(
	value: string | undefined,
): string | undefined {
	if (!value) return undefined;
	const stripped = value.trim().replace(/^\(/, '').replace(/\)$/, '');
	const parts = stripped.split(',').map((p) => p.trim());
	if (parts.length !== 2) return undefined;
	const month = MONTHS[parts[0].toLowerCase()];
	const year = parseInt(parts[1], 10);
	if (!month || !Number.isFinite(year)) return undefined;
	return `${year}-${String(month).padStart(2, '0')}-01`;
}
