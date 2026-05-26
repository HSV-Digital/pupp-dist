# Setup Guide

This guide walks a partner from private-repo access to a working deployment.
It matches the current monorepo layout and root `.env` contract.

## Before you start

You will need:

- read access to the private repository
- Node.js 20 or later
- Docker Desktop or a compatible Docker engine
- a public web origin for non-local OAuth flows
- service credentials for the features you intend to use

## Service checklist

| Service | Required | Purpose |
| --- | --- | --- |
| PostgreSQL | Yes | Primary application database |
| Redis | Yes | Queueing and cache-backed workflows |
| Microsoft Entra ID | Yes for internal dashboard sign-in | Internal user authentication |
| Reseller Microsoft Entra ID | Optional | Reseller Microsoft sign-in |
| Google OAuth | Optional | Reseller Google sign-in |
| Azure Blob Storage | Optional for first login, required for blob-backed generation and download flows | Generated assets, uploads, async downloads |
| PostHog | Optional | Product analytics and admin analytics |

The app does not currently require an SMTP or transactional email provider to start. Its email features generate downloadable DOCX assets and links rather than sending mail directly.

## Step 1: Get the repository

If the shareable repo is hosted on GitHub or a similar provider, accept the invitation to the private repository first.

Clone the repository:

```bash
git clone https://github.com/[ORG]/[REPO].git
cd [REPO]
```

If your host requires a Personal Access Token for HTTPS, use that token instead of your account password.

## Step 2: Choose your deployment path

There are three practical ways to start:

1. Local Docker: use Docker-managed PostgreSQL and Redis for first boot.
2. Self-hosted with managed services: run only `web` and `api` in Docker and point them at external PostgreSQL and Redis.
3. Azure-first production: deploy `web` and `api` separately and use managed PostgreSQL, Redis, and Blob Storage.

The same root `.env` model supports all three.

## Step 3: Understand the env files

The root [.env.example](../.env.example) file is the canonical configuration contract for the whole product.

Use the root `.env` for:

- Docker Compose deployments
- partner-hosted production deployments
- any setup that runs both `apps/web` and `apps/api`

App-local examples also exist:

- [apps/web/.env.example](../apps/web/.env.example)
- [apps/api/.env.example](../apps/api/.env.example)

Those files are convenience subsets for running a single app in isolation. Do not treat them as separate sources of truth.

## Step 4: Create `.env`

### Recommended: interactive setup

Run:

```bash
chmod +x setup.sh
./setup.sh
```

`setup.sh` installs dependencies and launches the setup wizard. The wizard writes a root `.env` file and auto-generates the internal signing and token secrets.

The wizard currently asks for:

- deployment mode: local Docker or managed services
- public web and API URLs
- internal server-side API base URL for managed deployments
- optional public asset base URL
- internal Microsoft Entra client ID and secret
- reseller Microsoft Entra client ID and secret
- reseller Google client ID and secret
- PostgreSQL connection details
- Redis connection details
- optional Azure Blob Storage account settings
- optional PostHog client and server token settings

It also generates values for:

- `AUTH_SECRET` and `NEXTAUTH_SECRET`
- `DL_TOKEN_ENCRYPTION_KEY`
- `PDF_DL_TOKEN_SECRET`
- `PDF_PASSWORD_ENCRYPTION_KEY`
- `PPT_TOKEN_SECRET`
- `RESELLER_API_TOKEN_SECRET`

### Manual: copy the template

If you prefer to fill values yourself:

```bash
cp .env.example .env
```

Then edit `.env` and supply the values that apply to your deployment.

## Step 5: Configure external services

Use these service guides while filling in `.env`:

- [Authentication](./services/authentication.md)
- [Database](./services/database.md)
- [Redis](./services/redis.md)
- [Storage](./services/storage.md)
- [Analytics](./services/analytics.md)
- [Email assets](./services/email.md)

Important current behavior:

- `DATABASE_URL` and `REDIS_URL` are required for a working app.
- `AUTH_SECRET` is required for auth sessions. The wizard generates it automatically.
- `NEXT_PUBLIC_API_BASE_URL` is the browser-facing API origin.
- `API_BASE_URL` is the server-side API origin used by the web app.
- `FRONTEND_URL` is used by the API for CORS and link generation.
- Blob Storage is optional until you use blob-backed workflows.
- PostHog can be left blank if analytics are not needed.
- advanced PostHog admin analytics credentials are not prompted by the setup wizard and must be added manually if you use those analytics surfaces.

## Step 6: Start the application

### Option A: local Docker

This starts `web`, `api`, PostgreSQL, and Redis:

```bash
docker compose --profile local up -d
```

Default local ports:

- web: `http://localhost:3000`
- api: `http://localhost:3001`
- postgres: `localhost:5432`
- redis: `localhost:6379`

### Option B: managed PostgreSQL and Redis

If `.env` points to external PostgreSQL and Redis, start only the application services:

```bash
docker compose up -d
```

Do not use the `local` profile unless you explicitly want the bundled PostgreSQL and Redis containers as well.

### Option C: direct app execution

This is mainly useful for development or debugging:

```bash
npm install
npm run dev
```

For direct API execution outside Docker, run migrations yourself:

```bash
npm run db:migrate --workspace api
```

## Step 7: Verify first boot

Check the health endpoints:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3001/health
```

A healthy response should report `status: ok`.

Then verify:

1. the landing page loads
2. internal Microsoft sign-in starts successfully
3. reseller sign-in starts if you configured reseller auth
4. the dashboard can load data after sign-in

If Blob Storage is configured, also test one blob-backed generation flow such as a proposal asset bundle or async PDF export.

## URL settings that must stay aligned

For production deployments, these values must describe the real deployed origins:

- `NEXT_PUBLIC_APP_URL`: public web origin
- `NEXT_PUBLIC_API_BASE_URL`: public API origin used by browsers
- `API_BASE_URL`: internal API origin used by the server-side web app
- `FRONTEND_URL`: public web origin used by the API for CORS and generated links
- `API_PUBLIC_BASE_URL`: public API origin embedded in generated links
- `PARTNER_UPLOAD_URL`: public reseller page used in generated partner-facing links

On a simple single-host reverse-proxy deployment, `NEXT_PUBLIC_APP_URL` and `FRONTEND_URL` will normally match, and `NEXT_PUBLIC_API_BASE_URL` and `API_PUBLIC_BASE_URL` will normally match.

## Next steps

- For container and production layout details, see [docs/DEPLOYMENT.md](./DEPLOYMENT.md).
- For env naming and precedence, see [docs/CONFIGURATION.md](./CONFIGURATION.md).
- If something fails, see [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md).
