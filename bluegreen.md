# Blue-Green Deployment + Azure Key Vault Runbook

Reference for replicating the deployment topology used by `agent-b` on another monorepo
that shares the same shape: Next.js web app + NestJS API, deployed to a single Azure VM,
fronted by nginx, with secrets in Azure Key Vault.

This is a **single-VM blue-green** scheme, not a multi-VM / load-balancer scheme. Two
git checkouts on the same host run on different ports; nginx flips between them. It is
cheap, fast to roll back, and good enough for staging / low-traffic prod. If you need
zero-downtime across host failures, this is the wrong design.

---

## 1. Architecture

```
                 ┌────────────── Azure VM (azureuser) ─────────────────┐
                 │                                                     │
   public ──►  nginx  ──►  upstream frontend_active ──►  127.0.0.1:3000 (web blue)
                 │                                  ╲                  │
                 │                                   ╲►  127.0.0.1:4000 (web green)
                 │                                                     │
                 │       upstream backend_active  ──►  127.0.0.1:3001 (api blue)
                 │                                  ╲                  │
                 │                                   ╲►  127.0.0.1:4001 (api green)
                 │                                                     │
                 │   PM2: frontend-blue / backend-blue                 │
                 │        frontend-green / backend-green               │
                 │                                                     │
                 │   /home/azureuser/<app>/blue   ← git checkout       │
                 │   /home/azureuser/<app>/green  ← git checkout       │
                 │   /home/azureuser/.current_env  (active color)      │
                 └─────────────────────────────────────────────────────┘
                                     │
                                     │ DefaultAzureCredential (managed identity)
                                     ▼
                          Azure Key Vault (RBAC: Key Vault Secrets User)
```

Active color serves traffic. Idle color is a hot spare that holds the previous build, so
rollback is just an nginx config flip — no rebuild.

State of truth for "which color is live": `/home/azureuser/.current_env`. Nginx upstream
file is regenerated from a template on every switch.

---

## 2. Azure resources you need

Before any deploy, provision once per environment (staging, prod, …):

1. **VM** — Ubuntu 22.04+, Node 20+, with **system-assigned managed identity** enabled.
2. **Key Vault** — RBAC mode (not access-policy mode).
3. **Role assignment** — grant the VM's managed identity the role
   `Key Vault Secrets User` scoped to the vault.
   ```bash
   az role assignment create \
     --assignee "<vm-managed-identity-principal-id>" \
     --role "Key Vault Secrets User" \
     --scope "/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.KeyVault/vaults/<vault>"
   ```
4. **Postgres + Redis** — managed (Azure Database for PostgreSQL, Azure Cache for Redis)
   or otherwise reachable from the VM. Hostnames + creds live in the vault.
5. **DNS + TLS cert** for the public origin pointed at the VM's public IP.
6. **Outbound firewall rule** to `*.vault.azure.net` (default-allow, but worth checking
   if egress is locked down).

The VM does **not** need any service principal credentials in env vars. `az login --identity`
and `DefaultAzureCredential` (used by `@azure/identity`) both authenticate via IMDS.

---

## 3. Key Vault layout

Secrets are named in **kebab-case** (Key Vault doesn't allow underscores) and mapped at
runtime to **SCREAMING_SNAKE_CASE** env vars.

```
auth-secret                       → AUTH_SECRET
azure-ad-client-secret            → AZURE_AD_CLIENT_SECRET
azure-ad-reseller-client-secret   → AZURE_AD_RESELLER_CLIENT_SECRET
dl-token-encryption-key           → DL_TOKEN_ENCRYPTION_KEY
pdf-dl-token-secret               → PDF_DL_TOKEN_SECRET
pdf-password-encryption-key       → PDF_PASSWORD_ENCRYPTION_KEY
ppt-token-secret                  → PPT_TOKEN_SECRET
reseller-api-token-secret         → RESELLER_API_TOKEN_SECRET
resend-api-key                    → RESEND_API_KEY
posthog-project-token             → POSTHOG_PROJECT_TOKEN
posthog-endpoint-api-key          → POSTHOG_ENDPOINT_API_KEY
posthog-personal-api-key          → POSTHOG_PERSONAL_API_KEY
azure-storage-account-key         → AZURE_STORAGE_ACCOUNT_KEY
external-pghost                            → PGHOST
external-pgpassword                        → PGPASSWORD
```

What goes in the vault vs the `.env`:

- **Vault**: anything sensitive (DB password, third-party API keys, signing secrets, OAuth
  client secrets, storage account keys).
- **`.env` on the VM**: non-secret config (`AZURE_KEY_VAULT_URL`, public URLs, feature
  flags, pool sizes, log levels, tenant IDs).

The vault URL itself is **not** a secret — it's the bootstrap pointer. It must be in
`apps/api/.env` (or exported in the deploy environment) so the build/runtime knows which
vault to call.

---

## 4. Application code — what the API must do

Two pieces of code, in this exact order:

### 4.1 Key Vault loader — `apps/api/src/config/key-vault.ts`

```ts
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

const KV_SECRET_TO_ENV: Record<string, string> = {
  'auth-secret': 'AUTH_SECRET',
  'azure-ad-client-secret': 'AZURE_AD_CLIENT_SECRET',
  // … one entry per secret you provisioned
};

let loaded = false;

export async function loadSecretsFromKeyVault(): Promise<void> {
  if (loaded) return;

  const vaultUrl = process.env.AZURE_KEY_VAULT_URL?.trim();
  if (!vaultUrl) {
    throw new Error('AZURE_KEY_VAULT_URL is required');
  }

  const client = new SecretClient(vaultUrl, new DefaultAzureCredential());
  const results = await Promise.all(
    Object.keys(KV_SECRET_TO_ENV).map(async (name) => {
      const secret = await client.getSecret(name);
      return { name, value: secret.value };
    }),
  );

  for (const { name, value } of results) {
    if (value === undefined) throw new Error(`Secret "${name}" has no value`);
    const envKey = KV_SECRET_TO_ENV[name];
    if (!process.env[envKey]) process.env[envKey] = value;
  }
  loaded = true;
}
```

Notes:
- Env vars set externally (e.g. by the deploy script's `eval` of `load-kv-secrets.sh`) win
  over vault values. This lets you override a single secret without re-uploading to the
  vault.
- A missing secret crashes the app. Don't catch it — failing fast at startup is the point.

### 4.2 Bootstrap order — `apps/api/src/main.ts`

```ts
async function bootstrap() {
  ensureAppEnvLoaded();          // load .env files into process.env
  await loadSecretsFromKeyVault(); // hydrate secrets BEFORE anything reads them
  const env = getEnv();          // now safe to validate
  await runDatabaseMigrations();
  const app = await NestFactory.create(AppModule);
  // …
  await app.listen(env.port);
}
void bootstrap();
```

### 4.3 ⚠️ The import-order trap (read this)

`getEnv()` validates required env vars and throws on missing ones. **Never call it at
module top level**, because Node evaluates all `import` chains before `bootstrap()` runs —
which means `getEnv()` fires before `loadSecretsFromKeyVault()` has hydrated anything, and
the app crashes with `X environment variable is required`.

**Bad** (crashes at boot):
```ts
// app.module.ts
const env = getEnv(); // ← evaluated during `import './app.module'` in main.ts

@Module({
  imports: [BullModule.forRoot({ connection: env.redisConnection })],
})
export class AppModule {}
```

**Good** (lazy — runs at module instantiation, after bootstrap):
```ts
// app.module.ts
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({ connection: getEnv().redisConnection }),
    }),
  ],
})
export class AppModule {}
```

Class-field initializers (`private readonly env = getEnv()`) are fine — they run at
construction, which Nest does after `bootstrap()` has set up env. The trap is only
top-level `const x = getEnv()` and any other module-level call.

When porting to a new app: grep the api source for `^const .* = getEnv()` and any
top-level statement that reads `process.env.X` for required vars. Move them inside
factories or class fields.

### 4.4 Web app secrets

Next.js needs `AZURE_AD_CLIENT_SECRET` and `AUTH_SECRET` at **build time** (during
`Collecting page data`), not just runtime. The deploy script handles this by `eval`ing
KV secrets into the shell **before** `npm run build`. The web app itself doesn't talk to
Key Vault.

---

## 5. Files to put in the repo

### 5.1 `ecosystem.config.js` (repo root)

```js
const path = require('path');

const color = process.env.COLOR;
if (!color) throw new Error('COLOR env var required (blue|green)');

const webPort = process.env.WEB_PORT || '3000';
const apiPort = process.env.API_PORT || '3001';
const logDir = '/home/azureuser/logs';

module.exports = {
  apps: [
    {
      name: `frontend-${color}`,
      cwd: path.join(__dirname, 'apps/web'),
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: webPort,
        // Server-side web → api MUST target this color's api, not the public domain.
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
      env: { NODE_ENV: 'production', PORT: apiPort },
      error_file: `${logDir}/api-${color}-error.log`,
      out_file: `${logDir}/api-${color}-out.log`,
      max_memory_restart: '1G',
    },
  ],
};
```

Important: server-side fetches from web → api **must** point at `127.0.0.1:<this color's api port>`,
not the public domain. If web (blue) calls the public URL, nginx routes it to api (green)
during a deploy — versions skew, sessions break.

### 5.2 `nginx/<app>-upstreams.conf.template`

```nginx
upstream frontend_blue  { server 127.0.0.1:3000; keepalive 64; }
upstream backend_blue   { server 127.0.0.1:3001; keepalive 64; }
upstream frontend_green { server 127.0.0.1:4000; keepalive 64; }
upstream backend_green  { server 127.0.0.1:4001; keepalive 64; }

upstream frontend_active { server 127.0.0.1:__FRONTEND_ACTIVE_PORT__; keepalive 64; }
upstream backend_active  { server 127.0.0.1:__BACKEND_ACTIVE_PORT__;  keepalive 64; }
```

Rendered into `/etc/nginx/conf.d/<app>-upstreams.conf` by `switch-traffic.sh`.

The site config (separate file, e.g. `/etc/nginx/sites-enabled/<app>`) references
`frontend_active` and `backend_active` and never changes. Only the upstreams file flips.

### 5.3 `scripts/deployment/config.sh` (shared constants)

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/azureuser/<app>"
LOG_DIR="/home/azureuser/logs"
STATE_FILE="/home/azureuser/.current_env"
NGINX_CONF="/etc/nginx/conf.d/<app>-upstreams.conf"
NGINX_TEMPLATE="${ROOT_DIR}/blue/nginx/<app>-upstreams.conf.template"
DEPLOY_LOG="${LOG_DIR}/deployments.log"

WEB_PORT_BLUE=3000;  API_PORT_BLUE=3001
WEB_PORT_GREEN=4000; API_PORT_GREEN=4001

HEALTH_RETRIES=20
HEALTH_SLEEP=3
DRAIN_SECONDS=30

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  echo "$msg"; mkdir -p "$LOG_DIR"; echo "$msg" >> "$DEPLOY_LOG"
}
active_color() { cat "$STATE_FILE" 2>/dev/null || echo blue; }
idle_color()   { [[ "$(active_color)" == blue ]] && echo green || echo blue; }
color_ports()  {
  [[ "$1" == blue ]] \
    && echo "$WEB_PORT_BLUE $API_PORT_BLUE" \
    || echo "$WEB_PORT_GREEN $API_PORT_GREEN"
}
pm2_process_names() { echo "frontend-$1 backend-$1"; }
pm2_start_color() {
  local color="$1"; read -r web_port api_port <<<"$(color_ports "$color")"
  ( cd "${ROOT_DIR}/${color}" \
    && COLOR="$color" WEB_PORT="$web_port" API_PORT="$api_port" \
       pm2 startOrReload ecosystem.config.js --update-env )
}
pm2_stop_color() {
  read -r w a <<<"$(pm2_process_names "$1")"; pm2 stop "$w" "$a" 2>/dev/null || true
}
```

### 5.4 `scripts/deployment/load-kv-secrets.sh`

Fetches every vault secret and emits `export VAR=value` lines so the deploy script can
`eval` them into the build environment. Run on the VM, authenticated via managed identity
(`az login --identity`).

Keep the `SECRETS=(…)` list **in sync with `KV_SECRET_TO_ENV` in the API code**. A
mismatch means either the API crashes at startup (env missing) or the build runs without
a build-time secret (Next.js fails at "Collecting page data").

### 5.5 `scripts/deployment/deploy-color.sh`

The full flow on the **idle** color:

1. `git fetch && git checkout <ref>` in `ROOT_DIR/<idle>`.
2. `npm ci`.
3. Read `AZURE_KEY_VAULT_URL` from `.env` (do **not** `source` the file — CRLF/quoting bites).
4. `az login --identity` (idempotent).
5. `eval "$(load-kv-secrets.sh)"` to inject build-time secrets.
6. Verify required build-time secrets (`AZURE_AD_CLIENT_SECRET`, `AUTH_SECRET`) are
   non-empty — abort if any is missing.
7. `npm run build`.
8. `pm2 startOrReload ecosystem.config.js --update-env` with `COLOR=<idle>`.
9. Health-check `http://127.0.0.1:<web>/api/health` and `http://127.0.0.1:<api>/health`,
   retrying `HEALTH_RETRIES` × `HEALTH_SLEEP` seconds.
10. `switch-traffic.sh <idle>` — re-renders nginx upstream conf, `nginx -t`,
    `systemctl reload nginx`, writes new color to `STATE_FILE`.
11. Sleep `DRAIN_SECONDS` so in-flight requests on the previous color finish.
12. `pm2 stop frontend-<previous> backend-<previous>` to free RAM. The checkout stays
    on disk so rollback is instant.

If any step fails before the traffic switch, the previous color is still serving — no
user-visible impact.

### 5.6 `scripts/deployment/health-check.sh`

```bash
check "web" "http://127.0.0.1:${web_port}/api/health"
check "api" "http://127.0.0.1:${api_port}/health"
```

The web app must expose `/api/health` (Next.js route handler) and the api must expose
`/health` (Nest controller). Both should return 200 quickly with no auth.

### 5.7 `scripts/deployment/switch-traffic.sh`

`sed` the template into the active conf file, `nginx -t`, `systemctl reload`, write the
state file. **Do not** `nginx -s reload` if `nginx -t` failed — leave traffic where it was.

### 5.8 `scripts/deployment/rollback.sh`

The previous deploy stopped the now-idle color's PM2 processes, so rolling back means:

1. `pm2 startOrReload` the rollback target (its build artifacts + `node_modules` are still on disk).
2. Health-check it.
3. `switch-traffic.sh <target>`.
4. Stop the failing color.

Rollback completes in ~10 seconds because there's no rebuild.

---

## 6. VM bootstrap (one-time, per environment)

```bash
# As azureuser on a fresh Ubuntu 22.04 VM with managed identity assigned.

# System packages
sudo apt-get update && sudo apt-get install -y \
  nginx git build-essential curl ca-certificates

# Node 20 + PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
az login --identity   # uses VM's managed identity; no creds needed

# Two checkouts of the same repo
mkdir -p /home/azureuser/<app> /home/azureuser/logs
cd /home/azureuser/<app>
git clone <repo-url> blue
git clone <repo-url> green
echo blue > /home/azureuser/.current_env

# .env on each color (non-secrets only — secrets come from KV at deploy time)
# At minimum:
#   AZURE_KEY_VAULT_URL=https://<vault>.vault.azure.net/
#   FRONTEND_URL=https://<public-domain>
#   API_PUBLIC_BASE_URL=https://<public-domain>
#   NEXT_PUBLIC_APP_URL=https://<public-domain>
#   NEXT_PUBLIC_API_BASE_URL=https://<public-domain>
#   PGHOST/PGUSER/PGDATABASE/PGPORT, REDIS_URL, etc. (non-secret parts)

# nginx site config (one-time): include the upstreams file and route to *_active.
sudo tee /etc/nginx/sites-available/<app> > /dev/null <<'EOF'
server {
    listen 443 ssl http2;
    server_name <public-domain>;
    # ssl_certificate / ssl_certificate_key from certbot or imported cert

    location /api/ {
        proxy_pass http://backend_active;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {
        proxy_pass http://frontend_active;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/<app> /etc/nginx/sites-enabled/<app>

# Initial upstream file (defaults to blue active)
cd /home/azureuser/<app>
./blue/scripts/deployment/switch-traffic.sh blue

# First deploy
./blue/scripts/deployment/deploy-color.sh master master
```

Set `TRUST_PROXY_HOPS=1` in api `.env` so Express trusts nginx's `X-Forwarded-For`.

PM2 boot persistence: `pm2 startup systemd && pm2 save` after the first successful start
so PM2 brings both colors back after a VM reboot (whichever ones were running at the time
of `pm2 save`).

---

## 7. Day-to-day operations

```bash
# Deploy a ref (sha or tag) to whichever color is idle:
ssh azureuser@<vm> '/home/azureuser/<app>/blue/scripts/deployment/deploy-color.sh <ref> master'
# (Run from `blue/` regardless of active color — the script figures out idle itself.)

# Roll back to the other color:
ssh azureuser@<vm> '/home/azureuser/<app>/blue/scripts/deployment/rollback.sh'

# What's live?
ssh azureuser@<vm> 'cat /home/azureuser/.current_env'

# Tail logs:
ssh azureuser@<vm> 'pm2 logs backend-$(cat /home/azureuser/.current_env)'
ssh azureuser@<vm> 'tail -f /home/azureuser/logs/deployments.log'
```

---

## 8. Common failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `X environment variable is required` at boot, even though it's in KV | Module-level `getEnv()` ran before `loadSecretsFromKeyVault()` (see §4.3) | Move call inside a factory or class field |
| Web build fails at "Collecting page data" with auth-related stack | Build-time secret missing during `npm run build` | Confirm `load-kv-secrets.sh` has the secret AND deploy script `eval`s it before build |
| `DefaultAzureCredential` 403 / `AKV10000` | Managed identity lacks `Key Vault Secrets User` role | Grant role at vault scope (§2) |
| Nginx serves old build after switch | `nginx -t` failed silently or `STATE_FILE` not updated | Inspect `/etc/nginx/conf.d/<app>-upstreams.conf` and `cat /home/azureuser/.current_env` |
| Web (blue) hits api (green) mid-deploy → version skew | Server-side web fetch goes to public URL instead of `127.0.0.1:<api port>` | `API_BASE_URL` in `ecosystem.config.js` must be set per-color (§5.1) |
| Sessions logged out across deploy | `AUTH_SECRET` rotated or differs between colors | Both colors read from the same KV secret — confirm KV value is stable |
| Rollback fails: target color's PM2 processes don't start | `node_modules` or `dist/` was wiped | Re-run `deploy-color.sh` against the rollback target's ref instead |
| New secret added but app crashes after deploy | `KV_SECRET_TO_ENV` (code) and `SECRETS` (load-kv-secrets.sh) drifted | Add the new secret to **both** lists; they must match exactly |

---

## 9. Porting checklist for a new app

When adapting this to a new monorepo with the same web+api shape:

- [ ] Add `@azure/identity` and `@azure/keyvault-secrets` to `apps/api/package.json`.
- [ ] Create `apps/api/src/config/key-vault.ts` with the secret → env-var map for the new app's secrets.
- [ ] Wire `loadSecretsFromKeyVault()` into `apps/api/src/main.ts` **before** `getEnv()` and **before** `NestFactory.create(AppModule)`.
- [ ] Audit the api source for top-level `getEnv()` / `process.env.X` reads of required vars; refactor to lazy factories / class fields (§4.3).
- [ ] Add `/health` (api) and `/api/health` (web) endpoints if missing.
- [ ] Add `ecosystem.config.js` at repo root (§5.1).
- [ ] Add `nginx/<app>-upstreams.conf.template` (§5.2).
- [ ] Add `scripts/deployment/{config,deploy-color,health-check,switch-traffic,rollback,load-kv-secrets}.sh`. Replace `<app>` paths and update `SECRETS` list.
- [ ] Provision Azure: VM with managed identity, Key Vault (RBAC), role assignment, DNS, TLS.
- [ ] Upload secrets to KV with the kebab-case names the loader expects.
- [ ] On the VM: clone repo to `blue/` and `green/`, write `.env` with non-secret config, install nginx site config (§6), run first `deploy-color.sh`.
- [ ] Verify: kill api on the active color → nginx 502s → run `rollback.sh` → traffic restored without a rebuild.

If any of these are skipped, deploys may succeed for a while and then fail in a confusing
way during the first secret rotation, the first rollback, or the first VM reboot.
