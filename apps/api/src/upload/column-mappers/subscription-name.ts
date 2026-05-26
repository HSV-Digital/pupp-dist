const ALLOWED_SUBSCRIPTION_KEYWORDS = [
	'business basic',
	'business standard',
	'business premium',
];

/**
 * Empty subscription names are allowed. When provided, the name must contain
 * "Business Basic", "Business Standard", or "Business Premium" (case-insensitive).
 */
export function isAllowedSubscriptionName(value: string | undefined): boolean {
	if (!value) return true;
	const normalized = value.trim().toLowerCase();
	if (normalized.length === 0) return true;
	return ALLOWED_SUBSCRIPTION_KEYWORDS.some((keyword) =>
		normalized.includes(keyword),
	);
}

/**
 * Stricter variant for sources where subscription name is required (Renewal).
 * Empty/missing values fail. Non-empty values must contain one of the allowed
 * keywords.
 */
export function isRequiredAllowedSubscriptionName(
	value: string | undefined,
): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	if (normalized.length === 0) return false;
	return ALLOWED_SUBSCRIPTION_KEYWORDS.some((keyword) =>
		normalized.includes(keyword),
	);
}

export const ALLOWED_SUBSCRIPTION_NAME_ERROR =
	'Subscription Name must contain "Business Basic", "Business Standard", or "Business Premium"';
