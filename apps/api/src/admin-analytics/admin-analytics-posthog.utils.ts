export function buildPostHogTimeWindowClause(
	columnName: string,
	windowFromIso: string,
	windowToExclusiveIso: string,
): string {
	return `${columnName} >= parseDateTimeBestEffort('${escapeSqlString(
		windowFromIso,
	)}')
		AND ${columnName} < parseDateTimeBestEffort('${escapeSqlString(
			windowToExclusiveIso,
		)}')`;
}

export function buildDistinctIdFilterClause(
	emails: readonly string[],
	columnName = 'distinct_id',
): string {
	if (emails.length === 0) {
		return 'AND 1 = 0';
	}

	return `AND ${columnName} IN (${emails.map(quoteSqlString).join(', ')})`;
}

export function buildSessionDaySelectClause(
	columnName = '$start_timestamp',
	alias = 'day',
): string {
	return `formatDateTime(${columnName}, '%Y-%m-%d') AS ${alias},`;
}

export function buildDateKeyExpression(
	columnName: string,
	alias = 'day',
): string {
	return `formatDateTime(${columnName}, '%Y-%m-%d') AS ${alias},`;
}

export function quoteSqlString(value: string): string {
	return `'${escapeSqlString(value)}'`;
}

export function escapeSqlString(value: string): string {
	return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}
