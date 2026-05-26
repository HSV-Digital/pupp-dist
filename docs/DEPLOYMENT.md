# Deployment

Project B deploys as two application services plus external dependencies.

## Runtime topology

| Service | Role | Default port |
| --- | --- | --- |
| `web` | Next.js frontend and auth entrypoint | `3000` |
| `api` | NestJS backend and asset/download APIs | `3001` |
| PostgreSQL | Primary database | `5432` |
| Redis | Queueing and cache | `6379` |

The current production shape is:

- `web` and `api` deployed separately
- PostgreSQL managed outside the app containers
- Redis managed outside the app containers
- Azure Blob Storage used when blob-backed generation flows are enabled

## Origin and routing model

The deployment succeeds or fails mostly based on URL alignment.

| Variable | Used by | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | web | Public browser origin for the app |
| `NEXT_PUBLIC_API_BASE_URL` | web browser code | Public API origin |
| `API_BASE_URL` | server-side web code | Internal API origin reachable from the web service |
| `FRONTEND_URL` | api | Public web origin for CORS and generated links |
| `API_PUBLIC_BASE_URL` | api | Public API origin embedded in generated download links |
| `PARTNER_UPLOAD_URL` | api | Public reseller page used in partner-facing link generation |

Recommended patterns:

- Docker Compose local: `API_BASE_URL=http://api:3001`
- Reverse proxy or public deployment: `NEXT_PUBLIC_API_BASE_URL` and `API_PUBLIC_BASE_URL` should be the browser-visible API URL
- If `web` and `api` are on the same private network, `API_BASE_URL` can stay private while `NEXT_PUBLIC_API_BASE_URL` remains public

## Docker deployments

### Local stack

Use:

```bash
docker compose --profile local up -d
```

This starts:

- `web`
- `api`
- `postgres`
- `redis`

Use this path for first boot, demos, and developer-owned environments.

### Self-hosted with managed services

Use:

```bash
docker compose up -d
```

In this mode:

- `web` and `api` still run in Docker
- PostgreSQL and Redis are expected to be external
- `.env` must contain the real `DATABASE_URL` and `REDIS_URL`

### What the containers do

- `apps/web/Dockerfile` builds and runs the Next.js app
- `apps/api/Dockerfile` runs migrations and then starts the NestJS API
- the web health check uses `GET /api/health`
- the api health check uses `GET /health`

## Azure-first deployment

The repo includes placeholder Azure files under [infra](../infra), but the current documented deployment shape is:

1. Deploy `web` and `api` as separate services.
2. Use Azure Database for PostgreSQL.
3. Use Azure Cache for Redis.
4. Use Azure Blob Storage for generated assets and async downloads if those workflows are required.
5. Store secrets in Key Vault or the hosting platform secret store.

Recommended Azure mapping:

| Concern | Suggested Azure service |
| --- | --- |
| `web` | App Service, Container Apps, or another container host |
| `api` | App Service, Container Apps, or another container host |
| PostgreSQL | Azure Database for PostgreSQL Flexible Server |
| Redis | Azure Cache for Redis |
| Blob storage | Azure Storage Account + Blob container |
| Secret storage | Key Vault or app-level secret settings |

### Azure-specific notes

- Set `DATABASE_URL` with `sslmode=require`.
- Azure Redis typically uses `rediss://` on port `6380`.
- Blob Storage supports either:
  - `AZURE_STORAGE_ACCOUNT_NAME` plus `AZURE_STORAGE_ACCOUNT_KEY`
  - `AZURE_STORAGE_ACCOUNT_NAME` with managed identity credentials available to the API runtime
- `AZURE_CDN_BASE_URL` is optional and only rewrites blob URLs when provided.

## Generic managed-service deployment

Outside Azure, the app is still provider-agnostic for:

- PostgreSQL
- Redis

The storage layer is not generic today. Blob-backed workflows assume Azure Blob Storage semantics.

## Reverse proxy and TLS

For any non-local deployment:

- terminate TLS at your load balancer or reverse proxy
- expose stable public URLs for both `web` and `api`
- keep OAuth callback URLs exact, including protocol and hostname
- ensure `FRONTEND_URL` matches the actual web origin to avoid CORS failures

## Secrets and config handling

Use the root [.env.example](../.env.example) as the canonical config reference.

Recommended secret handling:

- local and simple partner-hosted deployments: root `.env`
- managed production deployments: platform secret store or Key Vault
- do not commit filled `.env` files

The setup wizard can generate internal secrets automatically, but production teams should still treat the resulting values as sensitive credentials.

## Post-deploy verification

After deployment:

1. open the web landing page
2. confirm `GET /api/health` returns OK from the public web origin
3. confirm `GET /health` returns OK from the public API origin
4. test at least one auth flow
5. test dashboard data loading
6. if Blob Storage is configured, test a blob-backed generation/download flow

## Related docs

- [Setup Guide](./SETUP.md)
- [Configuration](./CONFIGURATION.md)
- [Authentication](./services/authentication.md)
- [Database](./services/database.md)
- [Redis](./services/redis.md)
- [Storage](./services/storage.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
