import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabaseClient } from './connection';
import { resolveDatabaseUrl } from './database-url';

const logger = new Logger('DatabaseMigration');
const MIGRATIONS_JOURNAL_PATH = path.join('meta', '_journal.json');

function resolveMigrationsFolder(): string {
	const candidates = [
		path.resolve(process.cwd(), 'drizzle', 'migrations'),
		path.resolve(__dirname, '..', '..', 'drizzle', 'migrations'),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(path.join(candidate, MIGRATIONS_JOURNAL_PATH))) {
			return candidate;
		}
	}

	throw new Error(
		`Unable to locate Drizzle migrations folder. Checked: ${candidates.join(', ')}`,
	);
}

export async function runDatabaseMigrations(): Promise<void> {
	const migrationsFolder = resolveMigrationsFolder();
	const databaseClient = createDatabaseClient(resolveDatabaseUrl());

	try {
		logger.log(`Applying database migrations from ${migrationsFolder}`);
		await migrate(databaseClient.db, { migrationsFolder });
	} finally {
		await databaseClient.sql.end();
	}
}
