const path = require('path');

const color = process.env.COLOR;
if (!color) {
	throw new Error('COLOR env var required (blue|green)');
}

const webPort = process.env.WEB_PORT || '3000';
const apiPort = process.env.API_PORT || '3001';
const logDir = '/home/azureuser/logs';

// Auth.js JWE session cookies carry the Microsoft access+refresh tokens and routinely
// land at ~10 KB once chunked. Combined with reseller/csrf cookies, the Cookie header
// on a single request can exceed Node's default 16 KB header limit. Raise both Node
// and (matching) nginx buffers so requests with bloated cookies do not 400.
const NODE_HEADER_ARGS = '--max-http-header-size=32768';

module.exports = {
	apps: [
		{
			name: `frontend-${color}`,
			cwd: path.join(__dirname, 'apps/web'),
			script: 'npm',
			args: 'run start',
			node_args: NODE_HEADER_ARGS,
			env: {
				NODE_ENV: 'production',
				PORT: webPort,
				NODE_OPTIONS: NODE_HEADER_ARGS,
				// Server-side web → api must target THIS color's api (not the
				// public domain, not the other color). Overrides .env value.
				API_BASE_URL: `http://127.0.0.1:${apiPort}`,
			},
			error_file: `${logDir}/web-${color}-error.log`,
			out_file: `${logDir}/web-${color}-out.log`,
			max_memory_restart: '1G',
		},
		{
			name: `backend-${color}`,
			cwd: path.join(__dirname, 'apps/api'),
			script: 'npm',
			args: 'run start:prod',
			node_args: NODE_HEADER_ARGS,
			env: {
				NODE_ENV: 'production',
				PORT: apiPort,
				NODE_OPTIONS: NODE_HEADER_ARGS,
			},
			error_file: `${logDir}/api-${color}-error.log`,
			out_file: `${logDir}/api-${color}-out.log`,
			max_memory_restart: '1G',
		},
	],
};
