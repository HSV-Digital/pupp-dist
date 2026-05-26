# Project B

Project B is a self-hosted proposal and renewal workflow platform with a Next.js web app and a NestJS API.

## Quick Start

**Option A: Interactive setup**

```bash
git clone https://github.com/[ORG]/[REPO].git
cd [REPO]
chmod +x setup.sh
./setup.sh
docker compose --profile local up -d
```

**Option B: Manual setup**

```bash
cp .env.example .env
docker compose --profile local up -d
```

For the full partner onboarding and provider setup flow, use [docs/SETUP.md](docs/SETUP.md).

## Monorepo Layout

```text
apps/
  api/    NestJS API service
  web/    Next.js web application
packages/
  shared/ Shared business rules and constants
  types/  Shared TypeScript types
```

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run setup
npm run prepare:distribution
```

## Documentation

| Document | Description |
| --- | --- |
| [Setup Guide](docs/SETUP.md) | First-time setup for local and hosted deployments |
| [Deployment](docs/DEPLOYMENT.md) | Docker and Azure deployment notes |
| [Configuration](docs/CONFIGURATION.md) | Environment variables and runtime config |
| [Updating](docs/UPDATING.md) | How to apply upstream updates |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common deployment and runtime issues |

Service-specific guides live under [docs/services](docs/services).

## Distribution Workflow

This repository is the engineering source of truth. Use `npm run prepare:distribution` to sync a clean partner-facing repository export into `../project-b-dist` while preserving repo metadata such as `.git`.

## License

This software is proprietary and distributed under the terms of the [LICENSE](LICENSE) file.
