import { ensureAppEnvLoaded } from '../config/load-env';

type EnvMap = Record<string, string | undefined>;

const DEFAULT_PG_PORT = 5432;

function readTrimmed(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function resolveDatabaseUrl(env: EnvMap = process.env): string {
	ensureAppEnvLoaded();

	const directUrl = readTrimmed(env.DATABASE_URL);
	if (directUrl) {
		return directUrl;
	}

	const host = readTrimmed(env.PGHOST);
	const user = readTrimmed(env.PGUSER);
	const password = readTrimmed(env.PGPASSWORD);
	const database = readTrimmed(env.PGDATABASE);
	const rawPort = readTrimmed(env.PGPORT);

	if (!host || !user || !database) {
		throw new Error(
			'DATABASE_URL is required, or set PGHOST, PGUSER, PGPASSWORD, PGDATABASE (PGPORT optional).',
		);
	}

	if (!password) {
		throw new Error('PGPASSWORD is required when DATABASE_URL is not set.');
	}

	const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : DEFAULT_PG_PORT;
	const port =
		Number.isFinite(parsedPort) && parsedPort > 0
			? parsedPort
			: DEFAULT_PG_PORT;

	const url = new URL('postgres://localhost');
	url.username = user;
	url.password = password;
	url.hostname = host;
	url.port = `${port}`;
	url.pathname = `/${database}`;

	return url.toString();
}

export function shouldUseDatabaseSsl(
	databaseUrl: string,
	env: EnvMap = process.env,
): boolean {
	try {
		const hostname = new URL(databaseUrl).hostname;
		if (hostname.endsWith('.postgres.database.azure.com')) {
			return true;
		}
	} catch {
		// ignore URL parse errors and fall back to env flag
	}

	return env.DB_SSL === 'true' || env.PGSSLMODE === 'require';
}
