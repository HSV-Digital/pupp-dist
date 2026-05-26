import path from 'node:path';
import { ensureAppEnvLoaded } from './load-env';

export interface RedisConnectionConfig {
	readonly db: number;
	readonly host: string;
	readonly password?: string;
	readonly port: number;
	readonly tls?: Record<string, never>;
	readonly username?: string;
}

function readStringEnv(name: string, defaultValue?: string): string {
	const rawValue = process.env[name];
	const value = rawValue?.trim();

	if (value && value.length > 0) {
		return value;
	}

	if (defaultValue !== undefined) {
		return defaultValue;
	}

	throw new Error(`${name} environment variable is required`);
}

function readStringEnvFromAliases(
	names: readonly string[],
	defaultValue?: string,
): string {
	for (const name of names) {
		const rawValue = process.env[name];
		const value = rawValue?.trim();

		if (value && value.length > 0) {
			return value;
		}
	}

	if (defaultValue !== undefined) {
		return defaultValue;
	}

	throw new Error(`${names.join(' or ')} environment variable is required`);
}

function readPositiveIntEnv(name: string, defaultValue: number): number {
	const rawValue = process.env[name]?.trim();

	if (!rawValue) {
		return defaultValue;
	}

	const parsed = Number.parseInt(rawValue, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}

	return parsed;
}

function readNonNegativeIntEnv(name: string, defaultValue: number): number {
	const rawValue = process.env[name]?.trim();

	if (!rawValue) {
		return defaultValue;
	}

	const parsed = Number.parseInt(rawValue, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${name} must be a non-negative integer`);
	}

	return parsed;
}

function readCommaSeparatedEnv(name: string): string[] {
	const rawValue = process.env[name]?.trim();
	if (!rawValue) {
		return [];
	}

	return rawValue
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
}

function readBooleanEnvFromAliases(
	names: readonly string[],
	defaultValue: boolean,
): boolean {
	for (const name of names) {
		const rawValue = process.env[name]?.trim().toLowerCase();
		if (!rawValue) {
			continue;
		}

		if (['1', 'true', 'yes', 'on'].includes(rawValue)) {
			return true;
		}

		if (['0', 'false', 'no', 'off'].includes(rawValue)) {
			return false;
		}

		throw new Error(`${name} must be a boolean-like value`);
	}

	return defaultValue;
}

function readTenantLabelsEnv(name: string): Readonly<Record<string, string>> {
	const labels = readCommaSeparatedEnv(name);
	const result: Record<string, string> = {};

	for (const label of labels) {
		const separatorIndex = label.indexOf('=');
		if (separatorIndex <= 0) {
			continue;
		}

		const tenantId = label.slice(0, separatorIndex).trim().toLowerCase();
		const tenantLabel = label.slice(separatorIndex + 1).trim();

		if (tenantId && tenantLabel) {
			result[tenantId] = tenantLabel;
		}
	}

	return result;
}

function resolveRedisConnection(): RedisConnectionConfig {
	const redisUrl = process.env.REDIS_URL?.trim();
	if (redisUrl) {
		try {
			const parsed = new URL(redisUrl);
			const port =
				parsed.port.trim().length > 0
					? Number.parseInt(parsed.port, 10)
					: parsed.protocol === 'rediss:'
						? 6380
						: 6379;
			const databaseSegment = parsed.pathname.replace(/^\/+/u, '').trim();
			const db =
				databaseSegment.length > 0 ? Number.parseInt(databaseSegment, 10) : 0;

			if (
				(parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') ||
				!parsed.hostname ||
				!Number.isFinite(port) ||
				port <= 0 ||
				!Number.isFinite(db) ||
				db < 0
			) {
				throw new Error('Invalid REDIS_URL');
			}

			return {
				host: parsed.hostname,
				port,
				username: parsed.username || undefined,
				password: parsed.password || undefined,
				db,
				tls: parsed.protocol === 'rediss:' ? {} : undefined,
			};
		} catch {
			throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
		}
	}

	return {
		host: readStringEnv('REDIS_HOST', 'localhost'),
		port: readPositiveIntEnv('REDIS_PORT', 6379),
		password: readStringEnv('REDIS_PASSWORD', '') || undefined,
		db: readNonNegativeIntEnv('REDIS_DB', 0),
	};
}

export interface AppEnv {
	readonly allowedTenantIds: readonly string[];
	readonly apiPublicBaseUrl: string;
	readonly azureAdClientId: string;
	readonly azureAdResellerClientId: string;
	readonly azureCdnBaseUrl: string;
	readonly azureStorageAccountKey: string;
	readonly azureStorageAccountName: string;
	readonly azureStorageContainerName: string;
	readonly blobSasExpirySeconds: number;
	readonly defaultTenantId: string;
	readonly demoModeEnabled: boolean;
	readonly demoResellerOrgId: string;
	readonly demoResellerUserId: string;
	readonly dlTokenEncryptionKey: string;
	readonly emailTemplatesDir: string;
	readonly freeipapiKey: string;
	readonly frontendUrl: string;
	readonly googleClientId: string;
	readonly gtmAssetsDir: string;
	readonly hsvDigitalTenantId: string;
	readonly internalTenantLabels: Readonly<Record<string, string>>;
	readonly isProduction: boolean;
	readonly microsoftTenantId: string;
	readonly partnerUploadUrl: string;
	readonly pdfAsyncMinPartSize: number;
	readonly pdfAsyncPartSize: number;
	readonly pdfAsyncSplitMaxDepth: number;
	readonly pdfCacheTtlSeconds: number;
	readonly pdfDlTokenSecret: string;
	readonly pdfDlTokenTtlSeconds: number;
	readonly pdfMaxConcurrency: number;
	readonly pdfPasswordEncryptionKey: string;
	readonly pdfRenderCacheVersion: string;
	readonly pdfRenderTimeoutMs: number;
	readonly posthogCaptureHost: string;
	readonly posthogEndpointApiKey: string;
	readonly posthogPersonalApiKey: string;
	readonly posthogProjectToken: string;
	readonly posthogQueryHost: string;
	readonly posthogWebProjectId: string;
	readonly port: number;
	readonly proposalFlyersDir: string;
	readonly proposalGenerationSelectionSnapshotLaunchAt: string;
	readonly proposalOptionsEmailTokenTtlSeconds: number;
	readonly qpdfBinary: string;
	readonly redisConnection: RedisConnectionConfig;
	readonly resellerApiTokenSecret: string;
	readonly resellerApiTokenTtlSeconds: number;
	readonly resellerExcludedOrgDomains: readonly string[];
	readonly resendApiKey: string;
	readonly resendFromEmail: string;
	readonly trustProxyHops: number;
	readonly uploadMaxConcurrency: number;
	readonly adminNotificationEmails: readonly string[];
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
	ensureAppEnvLoaded();

	if (cachedEnv) {
		return cachedEnv;
	}

	const isProduction = process.env.NODE_ENV === 'production';
	const frontendUrl = readStringEnv('FRONTEND_URL', 'http://localhost:3000');
	cachedEnv = {
		isProduction,
		port: readPositiveIntEnv('PORT', 3001),
		trustProxyHops: readPositiveIntEnv('TRUST_PROXY_HOPS', 1),
		uploadMaxConcurrency: readPositiveIntEnv('UPLOAD_MAX_CONCURRENCY', 25),
		frontendUrl,
		freeipapiKey: readStringEnv('FREEIPAPI_KEY', ''),
		apiPublicBaseUrl: readStringEnv(
			'API_PUBLIC_BASE_URL',
			'http://localhost:3001',
		),
		allowedTenantIds: readCommaSeparatedEnv('ALLOWED_TENANT_IDS').map(
			(tenant) => tenant.toLowerCase(),
		),
		azureAdClientId: readStringEnv('AZURE_AD_CLIENT_ID', ''),
		azureAdResellerClientId: readStringEnv('AZURE_AD_RESELLER_CLIENT_ID', ''),
		posthogProjectToken: readStringEnv('POSTHOG_PROJECT_TOKEN', ''),
		posthogCaptureHost: readStringEnv(
			'POSTHOG_CAPTURE_HOST',
			'https://us.i.posthog.com',
		),
		posthogPersonalApiKey: readStringEnv('POSTHOG_PERSONAL_API_KEY', ''),
		posthogEndpointApiKey: readStringEnv('POSTHOG_ENDPOINT_API_KEY', ''),
		posthogWebProjectId: readStringEnv('POSTHOG_WEB_PROJECT_ID', ''),
		posthogQueryHost: readStringEnv(
			'POSTHOG_QUERY_HOST',
			'https://us.posthog.com',
		),
		demoModeEnabled: readBooleanEnvFromAliases(
			['ENABLE_DEMO', 'NEXT_PUBLIC_ENABLE_DEMO'],
			false,
		),
		demoResellerOrgId: readStringEnv('DEMO_RESELLER_ORG_ID', '0987654321'),
		demoResellerUserId: readStringEnv('DEMO_RESELLER_USER_ID', '0123456789'),
		defaultTenantId: readStringEnv('DEFAULT_TENANT_ID', 'default-tenant'),
		googleClientId: readStringEnv('GOOGLE_CLIENT_ID', ''),
		microsoftTenantId: readStringEnv('MICROSOFT_TENANT_ID', ''),
		hsvDigitalTenantId: readStringEnvFromAliases(
			['INTERNAL_ADMIN_TENANT_ID', 'HSV_DIGITAL_TENANT_ID'],
			'',
		),
		internalTenantLabels: readTenantLabelsEnv('INTERNAL_TENANT_LABELS'),
		proposalGenerationSelectionSnapshotLaunchAt: readStringEnv(
			'PROPOSAL_GENERATION_SELECTION_SNAPSHOT_LAUNCH_AT',
			'2026-03-07T00:00:00.000Z',
		),
		dlTokenEncryptionKey: readStringEnv('DL_TOKEN_ENCRYPTION_KEY'),
		pdfAsyncPartSize: readPositiveIntEnv('PDF_ASYNC_PART_SIZE', 10_000),
		pdfDlTokenSecret: readStringEnv('PDF_DL_TOKEN_SECRET'),
		pdfDlTokenTtlSeconds: readPositiveIntEnv(
			'PDF_DL_TOKEN_TTL_SECONDS',
			86400,
		),
		pdfPasswordEncryptionKey: readStringEnv('PDF_PASSWORD_ENCRYPTION_KEY'),
		resellerApiTokenSecret: readStringEnv('RESELLER_API_TOKEN_SECRET'),
		resellerApiTokenTtlSeconds: readPositiveIntEnv(
			'RESELLER_API_TOKEN_TTL_SECONDS',
			604800,
		),
		resellerExcludedOrgDomains: readCommaSeparatedEnv(
			'RESELLER_EXCLUDED_ORG_DOMAINS',
		).map((domain) => domain.toLowerCase()),
		resendApiKey: readStringEnv('RESEND_API_KEY', ''),
		resendFromEmail: readStringEnv('EMAIL_FROM', ''),
		redisConnection: resolveRedisConnection(),
		pdfRenderTimeoutMs: readPositiveIntEnv('PDF_RENDER_TIMEOUT_MS', 15000),
		pdfMaxConcurrency: readPositiveIntEnv('PDF_MAX_CONCURRENCY', 4),
		pdfCacheTtlSeconds: readPositiveIntEnv('PDF_CACHE_TTL_SECONDS', 120),
		pdfRenderCacheVersion: readStringEnv('PDF_RENDER_CACHE_VERSION', 'v2'),
		pdfAsyncMinPartSize: readPositiveIntEnv('PDF_ASYNC_MIN_PART_SIZE', 1000),
		pdfAsyncSplitMaxDepth: readPositiveIntEnv('PDF_ASYNC_SPLIT_MAX_DEPTH', 4),
		gtmAssetsDir: readStringEnv(
			'GTM_ASSETS_DIR',
			path.join(process.cwd(), 'static', 'gtm-assets'),
		),
		emailTemplatesDir: readStringEnv(
			'EMAIL_TEMPLATES_DIR',
			path.join(process.cwd(), 'assets', 'email_templates'),
		),
		proposalFlyersDir: readStringEnv(
			'PROPOSAL_FLYERS_DIR',
			path.join(process.cwd(), 'assets', 'flyers'),
		),
		proposalOptionsEmailTokenTtlSeconds: readPositiveIntEnv(
			'PROPOSAL_OPTIONS_EMAIL_TOKEN_TTL_SECONDS',
			86400,
		),
		partnerUploadUrl: readStringEnv(
			'PARTNER_UPLOAD_URL',
			`${frontendUrl.replace(/\/+$/u, '')}/csp-partners`,
		),
		qpdfBinary: readStringEnv('QPDF_BINARY', 'qpdf'),
		azureStorageAccountName: readStringEnv('AZURE_STORAGE_ACCOUNT_NAME', ''),
		azureStorageAccountKey: readStringEnv('AZURE_STORAGE_ACCOUNT_KEY', ''),
		azureStorageContainerName: readStringEnv(
			'AZURE_STORAGE_CONTAINER_NAME',
			'proposal-assets',
		),
		blobSasExpirySeconds: readPositiveIntEnv(
			'BLOB_SAS_EXPIRY_SECONDS',
			7 * 24 * 3600,
		),
		azureCdnBaseUrl: readStringEnv('AZURE_CDN_BASE_URL', ''),
		adminNotificationEmails: readCommaSeparatedEnv(
			'ADMIN_NOTIFICATION_EMAILS',
		).map((email) => email.toLowerCase()),
	};

	return cachedEnv;
}
