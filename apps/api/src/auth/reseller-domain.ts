const BASIC_EMAIL_PATTERN = /^[^\s@]+@([^@\s]+)$/u;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const GENERIC_RESELLER_DOMAIN_DENYLIST = new Set([
	'aol.com',
	'gmail.com',
	'googlemail.com',
	'gmx.com',
	'hotmail.com',
	'icloud.com',
	'live.com',
	'mail.com',
	'me.com',
	'msn.com',
	'outlook.com',
	'pm.me',
	'proton.me',
	'protonmail.com',
	'rocketmail.com',
	'yahoo.com',
	'ymail.com',
]);

export function normalizeResellerEmail(email: string): string {
	const normalized = email.trim().toLowerCase();

	if (!BASIC_EMAIL_PATTERN.test(normalized)) {
		throw new Error('Invalid reseller email address');
	}

	return normalized;
}

export function normalizeResellerDomain(domain: string): string {
	const normalized = domain
		.trim()
		.toLowerCase()
		.replace(/^@+/u, '')
		.replace(/\.+$/u, '');

	if (normalized.length === 0) {
		throw new Error('Reseller domain is required');
	}

	if (
		normalized.includes(' ') ||
		normalized.startsWith('.') ||
		normalized.endsWith('.') ||
		!normalized.includes('.')
	) {
		throw new Error('Invalid reseller domain');
	}

	const labels = normalized.split('.');
	if (labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))) {
		throw new Error('Invalid reseller domain');
	}

	return normalized;
}

export function extractResellerEmailDomain(email: string): string {
	const normalizedEmail = normalizeResellerEmail(email);
	const match = BASIC_EMAIL_PATTERN.exec(normalizedEmail);

	if (!match?.[1]) {
		throw new Error('Invalid reseller email address');
	}

	return normalizeResellerDomain(match[1]);
}

export function isGenericResellerDomain(domain: string): boolean {
	return GENERIC_RESELLER_DOMAIN_DENYLIST.has(normalizeResellerDomain(domain));
}

export function assertResellerCompanyDomain(domain: string): string {
	const normalizedDomain = normalizeResellerDomain(domain);

	if (GENERIC_RESELLER_DOMAIN_DENYLIST.has(normalizedDomain)) {
		throw new Error('Generic email domains are not allowed for login');
	}

	return normalizedDomain;
}

export function assertResellerCompanyEmail(email: string): {
	email: string;
	domain: string;
} {
	const normalizedEmail = normalizeResellerEmail(email);
	const domain = extractResellerEmailDomain(normalizedEmail);

	return {
		email: normalizedEmail,
		domain: assertResellerCompanyDomain(domain),
	};
}

export function deriveResellerOrganizationName(domain: string): string {
	const normalizedDomain = normalizeResellerDomain(domain);
	const [rootLabel] = normalizedDomain.split('.');
	const name = rootLabel
		.split(/[-_]+/u)
		.map((part) =>
			part.length > 0 ? `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}` : '',
		)
		.filter(Boolean)
		.join(' ');

	return name || normalizedDomain;
}
