import { defineConfig } from 'drizzle-kit';
import {
	resolveDatabaseUrl,
	shouldUseDatabaseSsl,
} from './src/database/database-url';

const databaseUrl = resolveDatabaseUrl();
const drizzleDatabaseUrl = withSslConfig(databaseUrl);

export default defineConfig({
	schema: './src/database/schema.ts',
	out: './drizzle/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: drizzleDatabaseUrl,
	},
});

function withSslConfig(url: string): string {
	if (!shouldUseDatabaseSsl(url)) {
		return url;
	}

	const parsed = new URL(url);
	parsed.searchParams.set('sslmode', 'require');
	return parsed.toString();
}
