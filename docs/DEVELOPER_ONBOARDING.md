# Developer Onboarding — CSP Partner Portal

A practical guide for new engineers. It covers **local setup** and the **flow of each screen with respect to the APIs it calls**. For deeper architecture, see [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md); for env/config details, see [CONFIGURATION.md](./CONFIGURATION.md) and [SETUP.md](./SETUP.md).

---

## 1. What this app is

A self-hosted platform that lets Microsoft Cloud Solution Provider (CSP) **partners/resellers** manage their renewing customers and generate upgrade proposals (PDF/PPT/email/GTM asset bundles). The product surface is the **CSP Partner portal**, served under the `/csp-partners` base path.

There are three user contexts:

| Context | Auth | Entry point |
| --- | --- | --- |
| **Reseller** (signed-in partner) | Microsoft Entra ID, Google, or email OTP | `/csp-partners` → `/csp-partners/dashboard` |
| **Demo** (anyone) | None — uses a shared demo tenant | `/csp-partners/demo` |
| **HSV admin analytics** | Reseller session + `@hsv.digital` email | `/csp-partners/analytics` |

---

## 2. Tech stack at a glance

| Layer | Tech |
| --- | --- |
| Web (`apps/web`) | Next.js 16 (App Router), React 19, Fluent UI 9, Tailwind 4, NextAuth |
| API (`apps/api`) | NestJS 11, Drizzle ORM, Passport, BullMQ (Redis queues) |
| Data | PostgreSQL, Redis |
| Storage | Azure Blob Storage (generated assets, async downloads) |
| Shared | `@repo/types` (domain types), `@repo/shared` (rules engine, pricing, upgrade matrix) |
| Monorepo | npm workspaces + Turborepo |

---

## 3. Local setup

### Prerequisites
- Node.js ≥ 20, npm 10.8.2+
- Docker Desktop (for bundled Postgres + Redis)
- Git access to this repo

### Fastest path (Docker, bundled DB + Redis)
```bash
# from repo root
chmod +x setup.sh
./setup.sh                          # installs deps + runs the .env wizard
docker compose --profile local up -d
```
This starts everything:
- web → http://localhost:3000 (portal lives at http://localhost:3000/csp-partners)
- api → http://localhost:3001
- postgres → localhost:5432
- redis → localhost:6379

### Manual env, if you prefer
```bash
cp .env.example .env                # then fill in values
docker compose --profile local up -d
```
The **root `.env`** is the single source of truth. `apps/web/.env.example` and `apps/api/.env.example` are convenience subsets, not separate configs.

### Direct dev mode (no Docker for the apps)
Point `.env` at a running Postgres + Redis, then:
```bash
npm install
npm run dev                         # turbo runs web + api concurrently
# one-time / after schema changes:
npm run db:migrate --workspace api
npm run db:seed --workspace api     # optional: seed subscription data from CSV
```

### Verify first boot
```bash
curl http://localhost:3000/api/health     # { status: "ok", service: "web" }
curl http://localhost:3001/health         # { status: "ok" }
```

### Common commands
```bash
npm run dev      # all apps, watch mode
npm run build    # build packages + apps (bottom-up: types → shared → apps)
npm run test     # all tests (Vitest)
npm run lint
```

> **Demo mode:** set `ENABLE_DEMO=true` to expose `/csp-partners/demo` and the unauthenticated `*/demo/*` API endpoints. Demo org id `0987654321`, demo user id `0123456789`.

---

## 4. How the web talks to the API (read this first)

The browser **never calls the NestJS API directly**. Every call goes through a Next.js **Backend-for-Frontend (BFF) proxy** route, which injects auth and forwards to NestJS. This hides the API origin and keeps the access token out of client JS.

```
Browser
  │  fetch('/csp-partners/api/reseller/proxy/<path>')
  ▼
Next.js rewrite  (/csp-partners/api/* → /api/*)   [next.config.ts]
  ▼
Next.js route handler  (apps/web/src/app/api/reseller/proxy/[...path]/route.ts)
  │  reads NextAuth JWT cookie, attaches  Authorization: Bearer <accessToken>
  ▼
NestJS API  (http://localhost:3001/<path>)
  │  JwtAuthGuard validates token → sets request.user (orgId, userType, ...)
  │  AllowedUserTypesGuard enforces @AllowedUserTypes('reseller')
  ▼
Postgres / Redis / Blob
```

Two client helpers build these URLs:

| Helper | Browser URL | Forwards to NestJS as | Auth |
| --- | --- | --- | --- |
| `resellerApiFetch(path)` <br>`apps/web/src/lib/reseller-api-client.ts` | `/csp-partners/api/reseller/proxy<path>` | `<path>` (e.g. `/api/reseller/customers`) | Bearer token injected by proxy |
| `demoResellerApiFetch(path)` <br>`apps/web/src/lib/demo-reseller-api-client.ts` | `/csp-partners/api/reseller/demo<path>` | demo endpoints | **none** |

Other BFF proxy passthroughs (public, no auth header): `/api/pdf/[...path]`, `/api/email/[...path]`, `/api/gtm/[...path]` → same-named NestJS controllers. These are public because generated documents are reached via signed download tokens (`dlToken`), not session auth.

### NestJS conventions
- **No global route prefix** — controller paths are absolute (e.g. `api/reseller/customers`).
- **Default port 3001** (`PORT` env).
- Global `JwtAuthGuard` + `AllowedUserTypesGuard`; opt out with `@Public()`, restrict with `@AllowedUserTypes('reseller' | 'internal')`.
- Demo controllers are `@Public()` but gated by `DemoModeGuard` (requires `ENABLE_DEMO=true`).
- Global validation pipe (`whitelist`, `forbidNonWhitelisted`, `transform`), Helmet, CORS for `FRONTEND_URL`, 10 MB JSON limit, baseline throttle 5 req/60s (public endpoints tighten this further).

---

## 5. Authentication flow (reseller)

1. User clicks sign-in on `/csp-partners` → browser navigates to `/api/reseller/auth/start`.
2. That route clears any session and kicks off NextAuth (`signIn('azure-ad')`) → Microsoft login.
3. On callback, NextAuth's `signIn` callback runs **MPN verification**: it calls Partner Center with the user's token; no `mpnId` → redirect back with `?error=no_mpn_access`. Generic email domains → `?error=generic_email`. (Microsoft staff bypass list and OTP/Google sign-ins skip the MPN check.)
4. NextAuth `jwt` callback exchanges the refresh token for an **API-scoped access token**, calls the API's `POST /api/reseller/auth/bootstrap` to upsert the reseller org + user, and stores `userType='reseller'`, `orgId`, `resellerUserId`, `accessToken`, `expiresAt` in the JWT. Tokens auto-refresh when expired.
5. The JWT lives in an HttpOnly cookie. The `(protected)` layout (`apps/web/src/app/csp-partners/(protected)/layout.tsx`) calls `auth()` server-side and redirects to `/csp-partners` if `userType !== 'reseller'`.
6. On every protected page load, `ResellerAuthProvider` re-checks `GET /api/reseller/verify-partner` (server route that calls Partner Center MPN).

**Alternate sign-ins:** Google (`POST /api/reseller/auth/google-bootstrap`) and email OTP (`POST /api/reseller/auth/otp/request` then `/verify`).

Key files: `apps/web/src/lib/reseller-auth.ts` (NextAuth config + callbacks), `auth-runtime.ts` (JWT extraction), `backend-proxy.ts` (token injection).

---

## 6. Screen-by-screen flow → APIs

All API paths below are the **NestJS paths**. From the browser they are reached through the proxy described in §4 unless noted as a direct route handler.

### Root & redirects
| Route | Purpose | APIs |
| --- | --- | --- |
| `/` (`app/page.tsx`) | Redirect → `/csp-partners` | none |
| `/reseller` | Legacy redirect → `/csp-partners` | none |
| `/terms-of-use` | Static legal page | none |

### `/csp-partners` — Landing (public)
`app/csp-partners/page.tsx`, `ResellersHero.tsx`
- **Purpose:** marketing hero + sign-in. Authed resellers are redirected to the dashboard.
- **APIs:** `GET /api/reseller/auth/start` (begins OAuth). Single-customer "guest proposal" path is also launched from here.

### `/csp-partners/dashboard` — Reseller dashboard (protected) ⭐ core screen
`app/csp-partners/(protected)/dashboard/page.tsx`, hook `use-reseller-customers.ts`
- **Purpose:** the partner's customer book — paginated/sortable/filterable list, summary KPIs, add/edit customers, bulk upload, launch a proposal.
- **APIs (via `resellerApiFetch`, `@AllowedUserTypes('reseller')`):**

  | Action | Method + NestJS path |
  | --- | --- |
  | List customers (+ summary + filter options) | `GET /api/reseller/customers?page&pageSize&<filters>` |
  | Add customer | `POST /api/reseller/customers` |
  | Bulk add | `POST /api/reseller/customers/bulk` |
  | Edit / delete | `PATCH /api/reseller/customers/:id` · `DELETE /api/reseller/customers/:id` |
  | Bulk file upload (CSV/XLSX, ≤50 MB) | `POST /api/reseller/upload/file` |
  | Upload progress (SSE) | `GET /api/reseller/upload/:jobId/progress` |
  | Subscription enrichment upload | `POST /api/reseller/subscription-enrichment` (+ `/:jobId/progress` SSE) |
  | Export list to PDF (async) | `POST /api/reseller/pdf/list/link-async` → poll `GET /api/reseller/pdf/:jobId/status` |
  | MPN re-check (page load) | `GET /api/reseller/verify-partner` (Next route handler) |

- **Filters** (sent as query params): customer name, current SKU, region, seat range, current ARR, renewal date, Copilot fit/intent/cluster, compete status, transacted products, distributor, customer TPID, Copilot-Chat-to-Paid.
- Clicking a customer → `/csp-partners/proposal/[customerId]`.

### `/csp-partners/proposal/[customerId]` — Proposal builder (protected) ⭐ core screen
`app/csp-partners/(protected)/proposal/[customerId]/page.tsx`, hook `use-reseller-customer-subscriptions.ts`, renderer `ProposalPageContent.tsx`
- **Purpose:** build and view a personalized upgrade proposal for one customer — subscriptions, pricing/economics (computed via `@repo/shared` rules engine), Copilot metrics, currency switcher, then export to email/PPT/PDF/GTM bundle.
- **Load:**
  - `GET /api/reseller/customers/subscriptions?customerName=<id>` — the customer's subscriptions.
  - Fire-and-forget `POST /api/csp-partners/analytics/events/view-proposal`.
- **Export / asset APIs** (public proxies; downloads use signed `dlToken`):

  | Output | Create link | Download |
  | --- | --- | --- |
  | Customer proposal email (DOCX) | `POST /api/email/customer-proposal/link` | `GET /api/email/customer-proposal/download?dlToken` |
  | Partner proposal email | `POST /api/email/partner-proposal/link` (throttled 2/60s) | `GET /api/email/partner-proposal/download?dlToken` |
  | Opportunity list email | `POST /api/email/opportunity-list/link` (+ `/link-with-pdf`) | `GET /api/email/opportunity-list/download?dlToken` |
  | Proposal options email | `POST /api/email/proposal-options/link` (multipart) | `GET /api/email/proposal-options/download?dlToken` |
  | Proposal asset bundle | `POST /api/email/proposal-assets/link` · `/load` | `GET /api/email/proposal-assets/download?dlToken` |
  | PPT | `POST /api/email/proposal-ppt/session` / `/upload` | `GET /api/email/proposal-ppt/render` · `/download` |
  | GTM asset bundle | `POST /api/gtm/bundle/link` | `GET /api/gtm/bundle?dlToken` |

### `/csp-partners/proposal/[customerId]/assets` — Asset manager (protected)
- **Purpose:** manage the marketing/asset bundle for a proposal.
- **APIs:** loads the same `GET /api/reseller/customers/subscriptions?customerName=<id>`, then drives the `proposal-assets` / `gtm` link+download endpoints above.

### `/csp-partners/analytics` — Admin analytics (protected, HSV-only)
`app/csp-partners/(protected)/analytics/page.tsx`, `csp-partner-analytics-api.ts`
- **Purpose:** cross-partner usage dashboard. Server-side redirect to dashboard unless the user's email is `@hsv.digital`.
- **APIs (via `resellerApiFetch`, all under `api/csp-partners/analytics`):** `tile-counts`, `filter-options`, `by-country`, `by-country-sku`, `sku-tab-totals`, `sku-pie-grid` (all `GET` with `range`/`partner`/`country` params), plus `POST events/view-proposal`. The page fires several of these in parallel on load and on filter change.

### `/csp-partners/demo` + `/csp-partners/demo/proposal/[customerId]` — Demo (public)
- **Purpose:** the exact dashboard + proposal experience against a shared demo tenant, no sign-in. Shows a "data added here is public" warning.
- **APIs (via `demoResellerApiFetch`, `@Public()` + `DemoModeGuard`):** `GET/POST /api/reseller/demo/customers` (+ `/bulk`, `/:id`), `GET /api/reseller/demo/customers/subscriptions?customerName=<id>`, demo upload + enrichment endpoints, and the same public `email`/`pdf`/`gtm` link/download endpoints. Proposal email links use the `*/load-public` and `*/generate-public` variants that accept a client-supplied customer snapshot.

### `/csp-partners/clickthrough-demo` — Guided tour (public, demo-gated)
- Embeds a SupaDemo walkthrough iframe. Returns 404 unless demo mode is enabled. No API calls.

---

## 7. Where to look when…

| You want to… | Start here |
| --- | --- |
| Add/adjust a dashboard filter | `apps/web/src/lib/use-reseller-customers.ts` + `apps/api/src/reseller-customers/` (query DTO) |
| Change proposal pricing/incentives | `packages/shared/src/rules-engine.ts`, `upgrade-matrix.ts` |
| Add a new API endpoint | new/existing `*.controller.ts` in `apps/api/src/`; guard with `@AllowedUserTypes`/`@Public` |
| Change how the browser reaches the API | `apps/web/src/lib/backend-proxy.ts` + `app/api/reseller/proxy/[...path]/route.ts` |
| Touch auth/session | `apps/web/src/lib/reseller-auth.ts`; API side `apps/api/src/auth/` |
| DB schema / migrations | `apps/api/src/database/schema.ts`, `apps/api/drizzle/migrations/` |

---

## 8. Gotchas

- **Browser calls must go through the proxy.** Use `resellerApiFetch` / `demoResellerApiFetch`, not raw `fetch` to `:3001`.
- **`/csp-partners` prefix is real.** The app is served under it (`assetPrefix` + rewrite in `next.config.ts`); BFF URLs are `/csp-partners/api/...` even though route files live at `apps/web/src/app/api/...`.
- **Document downloads aren't session-authed** — they're authorized by signed `dlToken`. Don't add a session guard to `*/download`, `*/render`, `*/bundle`.
- **Demo endpoints 404/403 without `ENABLE_DEMO=true`.**
- **MPN check can block sign-in** in dev. If you hit `?error=no_mpn_access`, you're testing with an account that has no Partner Center MPN profile — use the OTP path or a bypass-listed account.
- **Keep the URL env vars aligned** (`NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`, `FRONTEND_URL`, `API_PUBLIC_BASE_URL`) — mismatches break CORS and generated links. See [SETUP.md §"URL settings that must stay aligned"](./SETUP.md).

---

## 9. Domain model & the rules engine (read before touching proposal code)

The proposal math lives in `packages/shared` (`@repo/shared`), with types in `packages/types` (`@repo/types`). It's pure, deterministic, framework-free logic shared by web and API. The product question it answers: *"This customer is on SKU X — which upgrades can we offer, what do they cost, and what partner incentives do they earn?"*

**Core vocabulary:**

| Term | Meaning |
| --- | --- |
| **Starting SKU** | The customer's *current* Microsoft 365 product. Canonical ids: `bb` (Business Basic), `bs` (Business Standard), `bp` (Business Premium), `other`. |
| **Ending SKU** | The product you propose upgrading *to* (Copilot/Security bundles): `bs_cb`, `bp_cb`, `bp_cb_purview`, `bp_defender`, `bp_purview`, `bp_defender_purview`. Each has a `listPrice` and a `promoPrice`, and an `upgradeType` of `AI` or `Security`. |
| **Upgrade matrix** | `VALID_UPGRADE_PATHS` (in `upgrade-matrix.ts`) maps each starting SKU → the ending SKUs it may upgrade to. You can't downgrade (e.g. `bp` cannot go to `bs_cb`). |
| **UpgradeScenario** | The full financial picture for one starting→ending pair at a given seat count: offer vs list vs current annual value, promo savings, incremental cost, plus `economics`. |
| **ScenarioEconomics** | The CSP partner incentive breakdown attached to a scenario. |
| **Journey** | `renewal` vs `new_customer` — changes which incentives apply. |

**Incentive tiers** (`INCENTIVE_RATES` in `upgrade-matrix.ts`), all computed on **reseller margin**, not list price:

| Tier | Rate | When |
| --- | --- | --- |
| CSP Core | 3.75% | Always (if partner is incentive-eligible) |
| Strategic Accelerator | 3% (regional override possible) | Ending SKU is a "premium" SKU in `STRATEGIC_ACCELERATOR_SKU_IDS` |
| Growth Accelerator | 7.5% | `renewal` journey only, on the margin *delta* over the current SKU |

**The proposal pipeline** (functions in `packages/shared/src/rules-engine.ts`):

```
subscription.currentProduct (messy string)
  → normalizeProduct()        // lowercase, strip punctuation
  → matchStartingSku()        // → canonical StartingSku | null
  → getValidUpgradePaths()    // → EndingSku[] (regionally priced)
  → calculateScenario()       // → UpgradeScenario (pricing)
       → calculateIncentives()// → ScenarioEconomics (the 3 tiers)
  → buildProposalScenarios()  // orchestrates all the above → proposal cards
```

`buildProposalScenarios({ currentProduct, seatCount, selectedSkuIds, journey, region, country })` is the one-call entry point the proposal screens use. Asset bundles are resolved separately: `gtm-manifest.ts` maps each ending SKU → its marketing assets, and `proposal-options-email.ts` resolves the right DOCX email template for a `(journey, filter)` pair.

> If a customer's product string doesn't match any pattern, `matchStartingSku` returns `null` and falls back to the `other` starting SKU. SKU/pricing changes belong **here**, not in the API or web layers.

---

## 10. Data model

Drizzle schema: `apps/api/src/database/schema.ts`; migrations in `apps/api/drizzle/migrations/`. The tables split into **two worlds**:

### A. Reseller world (org-scoped — what the CSP portal uses)
Every table here has an `org_id` FK to `reseller_organization` and is the data a signed-in partner sees.

```
reseller_organization (the partner; has mpnId, normalizedDomain)
  ├─1:N─ reseller_users (members; email, passwordHash for OTP, lastLoginAt)
  │        └─1:N─ reseller_user_identity_aliases (entra/google/otp identities)
  ├─1:N─ external_subscription   ← THE RESELLER'S CUSTOMERS/SUBSCRIPTIONS
  │        (accountName, currentSku, seats, ARR, renewalDate, region,
  │         + Copilot signals: copilotFit/Intent/Cluster, MAU, compete, TPID…)
  ├─1:N─ upload_jobs  ──1:N── flagged_rows  (bulk CSV/XLSX import tracking)
  ├─1:N─ reseller_subscription_enrichment_jobs
  ├─1:N─ reseller_proposal_generation_selections  (what was proposed)
  ├─1:N─ csp_partner_analytics_events  (login/view/generated/upload events)
  ├─1:N─ reseller_audit_events
  └─1:N─ reseller_otps
```

**`external_subscription` is the most important table to know** — it's the reseller's customer book that powers the dashboard and proposals. ("Customers" in the UI are `external_subscription` rows grouped by `accountName`.)

### B. Internal/global world (not org-scoped) — *legacy, partly dormant*
These tables and their services predate the CSP-partner pivot. The internal **product surface (admin dashboard, internal Entra login) was removed** on this branch, so most of this layer now survives only as plumbing behind reseller features, scripts, and ingestion. Don't assume there's a working internal UI.
- `subscriptions` — globally ingested renewal dataset (via `/api/ingestion`), with personnel fields (PSS/PSA/PDM/PMM). Still read live by `dashboard.service.ts` / `admin-analytics/*` (which the async-PDF worker uses) and written by `ingestion.service.ts`.
- `users` + `user_identity_aliases` — internal Entra-provisioned staff. **No internal login path exists anymore** — there's no internal auth controller or strategy, only reseller auth.
- `partner_customers` — customers entered by internal users; still referenced by `partner-customers.service.ts` and `email.controller.ts`.
- `pdf_generation_jobs` — async PDF export state (has optional `org_id`, shared by both worlds).
- `master_distributor` / `master_partner` / `master_customer` — reference lookups for upload matching.
- `audit_events`, `proposal_generation_selections`, `analytics_download_*`, `download_token_redemptions`, `content_slides`, `access_requests`.

> **The `internal` user type is dormant.** It still exists in the type union (`AuthenticatedUserType = 'internal' | 'reseller'`), is the default audit `actorType`, and is accepted by two email endpoints (`proposal-assets/load`, `line-item/generate`) — but nobody can authenticate as `internal` in this build. Only reseller tokens are issued. Treat `internal` as legacy until/unless an internal login is reintroduced.

> **Service-only modules:** `DashboardModule`, `AdminAnalyticsModule`, `PartnerCustomersModule`, `AuditModule` are registered in `app.module.ts` but expose **no HTTP controllers** — they're internal dependencies. `IngestionModule` is the one internal module with a live endpoint (`POST /api/ingestion/subscriptions/csv`).

> **Two subscription tables, don't confuse them:** `external_subscription` (reseller, org-scoped, current product surface) vs `subscriptions` (internal, global ingested dataset). There's also a small `reseller_subscription` table used in some flows.

---

## 11. Tenancy & scoping (security-critical)

A reseller must only ever see their own org's data. Here's exactly how that's enforced:

1. The reseller's JWT carries `orgId`. `JwtAuthGuard` (`apps/api/src/auth/guards/jwt-auth.guard.ts`) decodes it and sets `request.user.orgId`; controllers read it via `@CurrentUser()`.
2. **Every service query filters explicitly by org**, e.g. `and(eq(externalSubscriptions.id, id), eq(externalSubscriptions.orgId, orgId))` throughout `reseller-customers.service.ts`. Dashboard queries route through a `buildWhereClause(orgId, query)` helper.
3. Demo controllers don't read `orgId` from a token — they **force** the demo org id `0987654321` (from env), so demo data is its own sandbox.

> ⚠️ **Important and easy to get wrong:** the reseller tables call `.enableRLS()`, **but there are no `CREATE POLICY` statements, no `FORCE ROW LEVEL SECURITY`, and no per-request session variable wiring.** The app connects as the table owner, which **bypasses RLS**. So today RLS provides *no* isolation — it's scaffolding for the future. **Tenant isolation depends entirely on the application-level `WHERE org_id = ?` filter.** Any new reseller query you write MUST scope by `orgId` from `@CurrentUser()`. Forgetting it = cross-org data leak.

---

## 12. Async jobs & testing

### Async jobs (BullMQ over Redis)
Long-running work (PDF export, bulk upload, enrichment, analytics) runs on **BullMQ** queues (`@nestjs/bullmq`), backed by `REDIS_URL`. Each has a NestJS `@Processor` worker:

| Queue | Enqueued by | Worker | Job table |
| --- | --- | --- | --- |
| `pdf-generation` | `pdf-async.service.ts` | `pdf-async.worker.ts` | `pdf_generation_jobs` |
| `csp-partner-file-upload` | `upload.service.ts` | `upload.worker.ts` | `upload_jobs` (+ `flagged_rows`) |
| `reseller-subscription-enrichment` | `…enrichment.service.ts` | `…enrichment.worker.ts` | `reseller_subscription_enrichment_jobs` |
| `csp-partner-analytics` | `…analytics.emitter.ts` | `…analytics.worker.ts` | `csp_partner_analytics_events` |

**Async PDF lifecycle** (the model to internalize):
```
POST …/pdf/list/link-async
   → insert pdf_generation_jobs row (status=queued, dlToken, encrypted password)
   → enqueue job on 'pdf-generation'
Worker: fetch rows → split into parts → render (Puppeteer) → encrypt
   → upload each part to Azure Blob ('pdf-exports' container)
   → update row (parts[], progress, status=completed, expiresAt +7d)
Client: poll GET …/pdf/async/status/:jobId  until completed
   → POST …/pdf/async/:jobId/password/reveal  (one-time)
   → GET …/pdf/async/{customer|reseller}-list?dlToken=…  (download)
```
Downloads are authorized by the **`dlToken`** (a signed token bound to the job), not by session — which is why those GET routes are `@Public()`. **Upload and enrichment** progress instead streams over **SSE** at `GET …/:jobId/progress`; the PDF flow uses **polling**.

### Testing
- **Framework:** Vitest everywhere. API config `apps/api/vitest.config.ts` (node env, SWC); web config `apps/web/vitest.config.ts` (jsdom + React plugin, setup `src/setupTests.ts`).
- **Unit tests** are colocated as `*.spec.ts` next to source (e.g. `reseller-customers.service.spec.ts`, `pdf-async.worker.spec.ts`, rules-engine specs in `packages/shared`).
- **E2E tests** live in `apps/api/test/*.e2e-spec.ts` and boot the full Nest app with Supertest.
- **Run:** `npm run test` (root, all workspaces) · `vitest` / `vitest run` / `vitest run --coverage` per app (`test`, `test:watch`, `test:cov`).
- When you change rules-engine math, update the `packages/shared` specs — they're the cheapest guardrail against pricing regressions.
</content>
</invoke>
