import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { shouldUseDatabaseSsl } from './database-url';

export function createDatabaseClient(databaseUrl: string) {
	const sql = postgres(databaseUrl, {
		max: 25,
		idle_timeout: 20,
		max_lifetime: 1800,
		ssl: shouldUseDatabaseSsl(databaseUrl) ? 'require' : undefined,
	});
	const db = drizzle(sql, { schema });

	return { db, sql };
}
