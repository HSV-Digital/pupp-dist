# Troubleshooting

## App will not start

Check these first:

1. confirm `.env` exists at the repo root
2. confirm `DATABASE_URL` and `REDIS_URL` are present
3. run `npm run build` to surface env validation or compile issues
4. if running outside Docker, run `npm run db:migrate --workspace api`

If Docker is involved, inspect container logs:

```bash
docker compose logs web
docker compose logs api
```

## Health checks fail

Expected endpoints:

- web: `GET /api/health`
- api: `GET /health`

If the web health check fails:

- confirm the `web` container started successfully
- confirm `API_BASE_URL` points to a reachable API origin

If the API health check fails:

- confirm database and Redis are reachable
- confirm the API container finished running migrations

## OAuth redirect or callback failures

Most auth failures are caused by an origin mismatch.

Verify all of the following:

- provider redirect URIs exactly match the deployed web URL
- `NEXT_PUBLIC_APP_URL` matches the browser-visible app origin
- `FRONTEND_URL` matches the same public web origin
- there is no missing or extra trailing slash
- local development uses `http://localhost:3000`, not `https://localhost:3000`

Current callback paths:

- internal Entra: `/api/auth/callback/azure-ad`
- reseller Entra: `/api/reseller/auth/callback/azure-ad`
- reseller Google: `/api/reseller/auth/callback/google`

## Browser can load the web app, but the app cannot reach the API

Check both API URL settings:

- `NEXT_PUBLIC_API_BASE_URL` is used by browser requests
- `API_BASE_URL` is used by server-side web code

Typical failure patterns:

- browser works locally but server-rendered pages fail: `API_BASE_URL` is wrong
- login page works but data calls fail in the browser: `NEXT_PUBLIC_API_BASE_URL` is wrong
- API works directly but browser requests are blocked: `FRONTEND_URL` does not match the real web origin, so CORS is rejecting requests

## Database connection failures

If using local Docker:

- start with `docker compose --profile local up -d`
- confirm the `postgres` container is healthy

If using managed PostgreSQL:

- confirm `DATABASE_URL` starts with `postgresql://`
- confirm firewall or network rules allow the API to connect
- on Azure PostgreSQL, add `sslmode=require`

If `DATABASE_URL` is blank, the API can fall back to `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`, but `DATABASE_URL` is the preferred and documented setting.

## Redis connection failures

If using local Docker:

- confirm the `redis` container is healthy
- confirm `REDIS_URL` is `redis://:redis@redis:6379/0` inside the compose network

If using managed Redis:

- use `rediss://` when your provider requires TLS
- on Azure Cache for Redis, the port is typically `6380`

## Blob-backed generation or download features fail

If you see errors like `Azure Blob Storage is not configured`, the app is running without usable Blob Storage configuration.

Check:

- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_ACCOUNT_KEY`, or a working Azure managed identity on the API runtime
- `AZURE_STORAGE_CONTAINER_NAME`

Without Blob Storage, login and basic dashboard use can still work, but blob-backed workflows can fail, including:

- generated asset uploads
- async PDF download flows
- some proposal bundle or presentation flows

## PostHog behavior is missing or inconsistent

Client analytics are disabled when `NEXT_PUBLIC_POSTHOG_KEY` is blank.

Server-side analytics are disabled when `POSTHOG_PROJECT_TOKEN` is blank.

Admin analytics that depend on PostHog API access may also require:

- `POSTHOG_ENDPOINT_API_KEY`
- `POSTHOG_PERSONAL_API_KEY`
- `POSTHOG_WEB_PROJECT_ID`

## Email-related features do not send email

This is expected in the current codebase.

The app generates downloadable email assets and links. It does not currently require or ship a transactional email delivery provider. If your deployment needs actual outbound sending, that must be implemented outside the current setup flow.

## Demo routes return 404

Demo surfaces are intentionally gated behind `NEXT_PUBLIC_ENABLE_DEMO=true`.

If demo mode is off:

- `/demo/*` routes are blocked in the web app
- demo-only API surfaces are also disabled

## Still stuck

Re-check these docs together:

- [Setup Guide](./SETUP.md)
- [Deployment](./DEPLOYMENT.md)
- [Configuration](./CONFIGURATION.md)
- [docs/services](./services)
