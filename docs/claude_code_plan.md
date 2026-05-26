# File Upload & Enrichment System
# Claude Code Implementation Plan

---

## What We Are Building

CSP Partners upload Excel or CSV files containing renewal and CLAS data. The system
identifies the file type, processes every row, and stores data across four master
tables. Duplicate records are prevented. Existing records are enriched when new
data arrives. Rows that cannot be auto-resolved are flagged for manual review.
Processing is async — the frontend shows live progress while the worker runs.

---

## Tech Stack

- **Backend:** NestJS, PostgreSQL, BullMQ, Redis, Multer
- **Frontend:** React
- **File formats:** `.xlsx` and `.csv`

---

## Suggested File Structure

```
src/
  upload/
    upload.module.ts
    upload.controller.ts
    upload.service.ts
    upload.worker.ts
    dto/
      upload-response.dto.ts
      progress.dto.ts
    processors/
      distributor.processor.ts
      partner.processor.ts
      customer.processor.ts
      subscription.processor.ts
    flagged/
      flagged.controller.ts
      flagged.service.ts
    config/
      source-signatures.config.ts
      column-mappings.config.ts
      source-priority.config.ts
    utils/
      normalize.util.ts
      file-parser.util.ts
      hash.util.ts

frontend/
  src/
    pages/
      UploadPage.tsx
      FlaggedRowsPage.tsx
      UploadHistoryPage.tsx
    components/
      UploadForm.tsx
      ProgressView.tsx
      FlaggedRowCard.tsx
      UploadHistoryTable.tsx
    hooks/
      useUploadProgress.ts
    api/
      upload.api.ts
      flagged.api.ts
```

---

## Database — 6 Tables

Create all tables and indexes together. Indexes are required — every row
match fires up to 4 DB queries and without indexes they become full table scans.

### Master_Distributor

```sql
CREATE TABLE master_distributor (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id BIGINT,
  name           TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_dist_id   ON master_distributor (distributor_id);
CREATE INDEX idx_dist_name ON master_distributor (lower(trim(name)));
```

### Master_Partner

```sql
CREATE TABLE master_partner (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_id  BIGINT,
  name       TEXT,
  one_id     BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_part_global_id ON master_partner (global_id);
CREATE INDEX idx_part_name      ON master_partner (lower(trim(name)));
CREATE INDEX idx_part_one_id    ON master_partner (one_id);
```

### Master_Customer

```sql
CREATE TABLE master_customer (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_tpid BIGINT,
  customer_name TEXT,
  country_name  TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cust_tpid ON master_customer (customer_tpid);
CREATE INDEX idx_cust_name ON master_customer (
  lower(trim(customer_name)),
  lower(trim(country_name))
);
```

### External_Subscription

No foreign keys — fully denormalized. A record where `subscription_name`,
`licenses_count`, and `subscription_end_date` are all NULL is a **stub**.
Detect at query time — no flag column needed.

```sql
CREATE TABLE external_subscription (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_name       TEXT,
  distributor_id         BIGINT,
  partner_name           TEXT,
  partner_global_id      BIGINT,
  partner_one_id         BIGINT,
  customer_tpid          BIGINT,
  account_name           TEXT,
  country_name           TEXT,
  copilot_fit            TEXT,
  copilot_intent         TEXT,
  copilot_cluster        TEXT,
  mw_csp_annual_renewal  TEXT,
  mw_paid_seat_range     TEXT,
  has_transacted_product TEXT,
  has_compete            TEXT,
  tenant_ids             TEXT,
  subscription_name      TEXT,
  licenses_count         INTEGER,
  subscription_end_date  DATE,
  type                   TEXT,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sub_tpid         ON external_subscription (customer_tpid);
CREATE INDEX idx_sub_account_name ON external_subscription (lower(trim(account_name)));
CREATE INDEX idx_sub_partner_gid  ON external_subscription (partner_global_id);
CREATE INDEX idx_sub_partner_name ON external_subscription (lower(trim(partner_name)));
CREATE INDEX idx_sub_identity     ON external_subscription (
  lower(trim(subscription_name)),
  licenses_count,
  subscription_end_date
);
```

### Upload_Log

```sql
CREATE TABLE upload_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        TEXT,
  reseller_id   TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  file_name     TEXT,
  file_path     TEXT,
  file_hash     TEXT NOT NULL,
  status        TEXT DEFAULT 'queued',
  progress_pct  INTEGER DEFAULT 0,
  uploaded_at   TIMESTAMP DEFAULT NOW(),
  completed_at  TIMESTAMP,
  rows_total    INTEGER,
  rows_skipped  INTEGER DEFAULT 0,
  rows_created  INTEGER DEFAULT 0,
  rows_enriched INTEGER DEFAULT 0,
  rows_flagged  INTEGER DEFAULT 0,
  error_message TEXT
);
CREATE INDEX idx_upload_dedup  ON upload_log (reseller_id, source_type, file_hash);
CREATE INDEX idx_upload_job_id ON upload_log (job_id);
```

### Flagged_Rows

Two cases produce a flagged row:
- `AMBIGUOUS_CUSTOMER` — RENEWAL_PARTNER matched 2+ customers on name alone
- `AMBIGUOUS_SUBSCRIPTION` — 2+ existing subscriptions matched the same identity

```sql
CREATE TABLE flagged_rows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_log_id UUID NOT NULL REFERENCES upload_log(id),
  reseller_id   TEXT NOT NULL,
  source_type   TEXT NOT NULL,
  reason        TEXT NOT NULL,
  reason_detail TEXT,
  raw_row       JSONB NOT NULL,
  candidate_ids UUID[],
  status        TEXT DEFAULT 'pending',
  resolved_by   TEXT,
  resolved_at   TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_flagged_upload   ON flagged_rows (upload_log_id);
CREATE INDEX idx_flagged_reseller ON flagged_rows (reseller_id, status);
```

---

## Source Detection Config

`source-signatures.config.ts`

All listed columns must be present in the file header for a match.
Check in this exact order — CUSTOM is checked last.

```
RENEWAL_MICROSOFT:
  Distributor Name (From), Reseller Name (From), TPID, Customer Name,
  Expiration Ending Product, Expiration Ending Seats, Subscription End Date,
  Type, Distributor ID (From)

RENEWAL_PARTNER:
  PGAMpnId, MpnId, CustomerName, SubscriptionName, LicensesCount, SubscriptionEndDate

CLAS_MICROSOFT:
  Distributor Name, Partner Name (Reseller Name), Partner Global ID, Partner One ID,
  CustomerTPID, Account Name, Copilot Fit, Copilot Intent, Copilot Cluster, TenantIDs

CLAS_PARTNER:
  PartnerName, GlobalID, CustomerID, AccountName, Country,
  M365_CoPilot_Fit, M365_CoPilot_Intent, M365_CoPilot_Cluster, Has_MW_CSP_Annual_Renewal

CUSTOM:
  Customer Name, Country Name
  (only if none of the above matched)
```

`detectSourceType(headers: string[]): SourceType | null`
- Iterate signatures in order
- Return first where all required columns exist in headers
- Return null if nothing matched

---

## Column Mapping Config

`column-mappings.config.ts`

### RENEWAL_MICROSOFT
| Source column | Master field |
|---|---|
| Distributor Name (From) | distributor_name |
| Distributor ID (From) | distributor_id |
| Reseller Name (From) | partner_name |
| TPID | customer_tpid |
| Customer Name | account_name |
| Region | country_name |
| Expiration Ending Product | subscription_name |
| Expiration Ending Seats | licenses_count |
| Subscription End Date | subscription_end_date |
| Type | type |

### RENEWAL_PARTNER
| Source column | Master field |
|---|---|
| PGAMpnId | partner_global_id |
| MpnId | partner_one_id |
| CustomerName | account_name |
| SubscriptionName | subscription_name |
| LicensesCount | licenses_count |
| SubscriptionEndDate | subscription_end_date |

### CLAS_MICROSOFT
| Source column | Master field |
|---|---|
| Distributor Name | distributor_name |
| Partner Name (Reseller Name) | partner_name |
| Partner Global ID | partner_global_id |
| Partner One ID | partner_one_id |
| CustomerTPID | customer_tpid |
| Account Name | account_name |
| Country Name | country_name |
| Copilot Fit | copilot_fit |
| Copilot Intent | copilot_intent |
| Copilot Cluster | copilot_cluster |
| MW CSP Annual Renewal | mw_csp_annual_renewal |
| MW Paid Seat Range | mw_paid_seat_range |
| Has Transacted Product | has_transacted_product |
| Has Compete | has_compete |
| TenantIDs | tenant_ids |

### CLAS_PARTNER
| Source column | Master field |
|---|---|
| PartnerName | partner_name |
| GlobalID | partner_global_id |
| CustomerID | customer_tpid |
| AccountName | account_name |
| Country | country_name |
| M365_CoPilot_Fit | copilot_fit |
| M365_CoPilot_Intent | copilot_intent |
| M365_CoPilot_Cluster | copilot_cluster |
| Has_MW_CSP_Annual_Renewal | mw_csp_annual_renewal |
| M365_Paid_Seat_Range | mw_paid_seat_range |
| Has_Transacted_Product | has_transacted_product |
| Has_Compete | has_compete |

### CUSTOM
| Source column | Master field | Required |
|---|---|---|
| Customer Name | account_name | yes |
| Country Name | country_name | yes |
| Customer TPID | customer_tpid | optional |
| Renewal Month | mw_csp_annual_renewal | optional |
| Microsoft 365 Subscription | subscription_name | optional |
| License Count | licenses_count | optional |

`translateRow(raw, sourceType): MasterRow`
- Apply the mapping for the source type
- Only include fields that are non-null and non-empty
- Discard any columns not in the mapping

---

## What Each Source Provides

| Field | RM | RP | CM | CP | CU |
|---|---|---|---|---|---|
| distributor_name | ✓ | | ✓ | | |
| distributor_id | ✓ | | | | |
| partner_name | ✓ | | ✓ | ✓ | |
| partner_global_id | | ✓ | ✓ | ✓ | |
| partner_one_id | | ✓ | ✓ | | |
| customer_tpid | ✓ | | ✓ | ✓ | opt |
| account_name | ✓ | ✓ | ✓ | ✓ | ✓ |
| country_name | ✓ | | ✓ | ✓ | ✓ |
| copilot_fit | | | ✓ | ✓ | |
| copilot_intent | | | ✓ | ✓ | |
| copilot_cluster | | | ✓ | ✓ | |
| mw_csp_annual_renewal | | | ✓ | ✓ | opt |
| mw_paid_seat_range | | | ✓ | ✓ | |
| has_transacted_product | | | ✓ | ✓ | |
| has_compete | | | ✓ | ✓ | |
| tenant_ids | | | ✓ | | |
| subscription_name | ✓ | ✓ | | | opt |
| licenses_count | ✓ | ✓ | | | opt |
| subscription_end_date | ✓ | ✓ | | | |
| type | ✓ | | | | |

RM = RENEWAL_MICROSOFT · RP = RENEWAL_PARTNER · CM = CLAS_MICROSOFT · CP = CLAS_PARTNER · CU = CUSTOM

---

## Normalization

`normalize.util.ts` — used at compare time only, never stored.

```typescript
normalizeText(value): string | null
// lowercase + trim whitespace
// return null if value is null/undefined/empty

normalizeSubscriptionName(value): string | null
// normalizeText first, then strip leading prefixes:
//   "o365 - "  |  "microsoft 365 "  |  "m365 "  |  "office 365 "
// "O365 - M365 Business Premium"   → "business premium"
// "Microsoft 365 Business Premium" → "business premium"
// "M365 Business Standard"         → "business standard"
```

---

## File Parsing

`file-parser.util.ts`

```typescript
// Parse header row only — returns fast regardless of file size
// Used by the API endpoint before anything is enqueued
parseHeaders(filePath: string): Promise<string[]>

// Count total rows — called once at start of worker for progress %
countRows(filePath: string): Promise<number>

// Stream rows one at a time — never loads all rows into memory
// Used by the worker
streamRows(filePath: string): AsyncIterable<Record<string, any>>
```

**Excel (.xlsx):** use `exceljs` in streaming mode (`WorkbookReader`)
**CSV:** use `csv-parse` piped from `createReadStream`

Detect format from file extension or MIME type. Both return the same
`Record<string, any>` shape with column header names as keys.

---

## Source Priority Config

`source-priority.config.ts`

When both the existing record value and the incoming row value are non-null,
the higher-priority source wins. Lower or equal priority is ignored.

| Field group | Priority (high → low) |
|---|---|
| CLAS fields | CLAS_MICROSOFT → CLAS_PARTNER → CUSTOM |
| Subscription fields | RENEWAL_MICROSOFT → RENEWAL_PARTNER → CUSTOM |
| Partner + distributor | CLAS_MICROSOFT → RENEWAL_MICROSOFT → CLAS_PARTNER → RENEWAL_PARTNER |
| Customer identity | CLAS_MICROSOFT → RENEWAL_MICROSOFT → CLAS_PARTNER → RENEWAL_PARTNER → CUSTOM |

**Never overwrite after first write:** `account_name`, `customer_name`, `id`, `created_at`

**Always update on every write:** `updated_at`

---

## Match Keys Per Table

Use `lower(trim(?))` on both sides for all text comparisons — never compare raw values.
Try keys in priority order — stop at first where all required fields are non-null.

### Master_Distributor
1. `distributor_id` exact match
2. `lower(trim(name))` = `lower(trim(incoming.distributor_name))`

### Master_Partner
1. `global_id` exact match
2. `lower(trim(name))` = `lower(trim(incoming.partner_name))`
3. `one_id` exact match

### Master_Customer
- **RENEWAL_PARTNER only** (no TPID, no country in this source):
  `lower(trim(customer_name))` = `lower(trim(incoming.account_name))`
  → 2+ results means flagged row
- **All other sources:**
  1. `customer_tpid` exact match (when incoming has it)
  2. `lower(trim(customer_name))` + `lower(trim(country_name))` both match

### External_Subscription — three scopes applied in sequence

**Customer scope** (always):
- `customer_tpid` if available → `WHERE customer_tpid = ?`
- else → `WHERE lower(trim(account_name)) = lower(trim(?))`

**Partner scope** (AND):
- `partner_global_id` if available → `AND partner_global_id = ?`
- else `partner_name` if available → `AND lower(trim(partner_name)) = lower(trim(?))`

**Subscription identity** (AND — only for non-CLAS sources):
- `AND lower(trim(subscription_name)) = normalizeSubscriptionName(?)`
- `AND licenses_count = ?`
- `AND subscription_end_date = ?`

---

## NestJS Module

```typescript
// upload.module.ts
@Module({
  imports: [
    BullModule.registerQueue({ name: 'file-upload' }),
    TypeOrmModule.forFeature([
      UploadLog, FlaggedRow,
      MasterDistributor, MasterPartner,
      MasterCustomer, ExternalSubscription,
    ]),
  ],
  controllers: [UploadController, FlaggedController],
  providers: [
    UploadService, UploadWorker, FlaggedService,
    DistributorProcessor, PartnerProcessor,
    CustomerProcessor, SubscriptionProcessor,
  ],
})
export class UploadModule {}
```

Register BullMQ at root in `AppModule`:
```typescript
BullModule.forRoot({
  connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) },
})
```

---

## Upload API Endpoint

`POST /upload` — multipart/form-data with fields `file` and `reseller_id`

Configure Multer: `dest: './uploads'`, file size limit 50MB.

Handler sequence:

```
1. parseHeaders(file.path)
   detectSourceType(headers)
   → null: unlink file, return 400 'Unrecognized file format'

2. computeMD5(file.path)
   query upload_log WHERE reseller_id=? AND source_type=? AND file_hash=?
   → exists: unlink file, return 400 'File already uploaded'

3. INSERT upload_log (status='queued', reseller_id, source_type,
                       file_name, file_path, file_hash)

4. uploadQueue.add('process', { uploadLogId, filePath, sourceType, resellerId })
   UPDATE upload_log SET job_id = job.id

5. Return 200: { job_id, upload_log_id, source_type }
```

---

## BullMQ Worker

```typescript
@Processor('file-upload', {
  concurrency: 3,
  lockDuration: 300_000,   // 5 min — prevents stale-job retry on large files
})
export class UploadWorker extends WorkerHost {
  async process(job: Job): Promise<void>
}
```

Worker sequence:

```
UPDATE upload_log status='processing'
REDIS SET upload:progress:{jobId} { pct:0, status:'processing', ... } EX 3600

counters = { rows_total, rows_processed, rows_created,
             rows_enriched, rows_skipped, rows_flagged } all start at 0

rows_total = await countRows(filePath)

for await (row of streamRows(filePath)):

  translatedRow = translateRow(row, sourceType)

  skip if account_name missing
  skip if CUSTOM and country_name missing
  (increment rows_skipped, continue)

  result = await db.transaction(async trx => {
    await distributorProcessor.process(translatedRow, sourceType, trx)
    await partnerProcessor.process(translatedRow, sourceType, trx)

    customerResult = await customerProcessor.process(translatedRow, sourceType, trx)
    if customerResult.flagged:
      INSERT flagged_rows (reason='AMBIGUOUS_CUSTOMER', ...) inside trx
      return { flagged: true }

    subResult = await subscriptionProcessor.process(translatedRow, sourceType, trx)
    if subResult.flagged:
      INSERT flagged_rows (reason='AMBIGUOUS_SUBSCRIPTION', ...) inside trx
      return { flagged: true }

    return { created: subResult.created }
  })

  increment rows_flagged / rows_created / rows_enriched accordingly
  rows_processed++

  if rows_processed % 10 === 0:
    pct = floor((rows_processed / rows_total) * 100)
    REDIS SET upload:progress:{jobId} { pct, status:'processing', ...counters } EX 3600
    (write to Redis only during processing — not to DB)

REDIS SET upload:progress:{jobId} { pct:100, status:'done', ...counters } EX 3600
UPDATE upload_log status='done', progress_pct=100, completed_at=now(), ...counters

on catch(err):
  REDIS SET upload:progress:{jobId} { status:'failed' } EX 3600
  UPDATE upload_log status='failed', error_message=err.message, completed_at=now()
  throw err   ← re-throw so BullMQ marks job failed

finally:  ← always runs, success or failure
  unlink(filePath)
  UPDATE upload_log SET file_path = null
```

---

## Per-Table Processor Logic

Each processor in `processors/` takes `(row: MasterRow, sourceType, trx)`.

### DistributorProcessor
Skip for: `RENEWAL_PARTNER`, `CLAS_PARTNER`, `CUSTOM`

```
match: distributor_id exact → else normalize(name) match
found  → fill null fields, apply priority on conflicts, UPDATE updated_at
missing → INSERT
```

### PartnerProcessor
Skip for: `CUSTOM`

```
match: global_id → normalize(name) → one_id
found  → fill null fields, apply priority, UPDATE updated_at
missing → INSERT
```

### CustomerProcessor

```
RENEWAL_PARTNER source:
  SELECT WHERE lower(trim(customer_name)) = lower(trim(incoming.account_name))
  0 results → INSERT, return { flagged: false, created: true }
  1 result  → enrich, return { flagged: false, created: false }
  2+ results → return { flagged: true, candidateIds, detail }

All other sources:
  customer_tpid set → SELECT WHERE customer_tpid = ?
  else → SELECT WHERE lower(trim(customer_name))=? AND lower(trim(country_name))=?
  found  → fill nulls (never overwrite customer_name), apply priority, UPDATE updated_at
  missing → INSERT
```

### SubscriptionProcessor

```
isClas = sourceType is CLAS_MICROSOFT or CLAS_PARTNER

Build query:
  Customer scope: customer_tpid if set, else lower(trim(account_name))
  Partner scope (AND): partner_global_id if set, else lower(trim(partner_name))
  Subscription identity (AND, only if NOT isClas):
    normalizeSubscriptionName(subscription_name) + licenses_count + subscription_end_date

isClas = true:
  found records → UPDATE CLAS fields on ALL matched rows, return { flagged:false, created:false }
  no records    → INSERT stub (subscription_name/licenses_count/end_date/type = NULL)
                  return { flagged:false, created:true }

isClas = false:
  0 matches  → INSERT full record, return { flagged:false, created:true }
  1 match    → enrich (fills nulls, applies priority — stubs auto-promoted same path)
               return { flagged:false, created:false }
  2+ matches → return { flagged:true, candidateIds, detail }
```

**Enrich rules (all tables):**
- Field is null in DB → write incoming value unconditionally
- Both non-null → apply source priority, higher priority wins
- `account_name` / `customer_name` → never overwrite after first write
- Always UPDATE `updated_at`

---

## SSE Progress Endpoint

`GET /upload/progress/:jobId`

Use NestJS `@Sse()` decorator returning an `Observable<MessageEvent>`.

```
interval = setInterval(1000ms):
  raw = REDIS GET upload:progress:{jobId}

  if raw is null:
    emit { pct:0, status:'queued' }   ← job not yet started
    return

  data = JSON.parse(raw)
  emit { data }

  if data.status === 'done' or 'failed':
    clearInterval
    complete observable

on client disconnect:
  clearInterval   ← prevents dangling timers
```

If Redis key has expired (job finished over 1 hour ago): read final
state from `upload_log` by `job_id` and return a regular JSON response
instead — no SSE stream needed for completed jobs.

**Redis key:** `upload:progress:{jobId}`
**Value shape:** `{ pct, status, rows_total, rows_processed, rows_created, rows_enriched, rows_skipped, rows_flagged }`
**TTL:** 3600 seconds

---

## Flagged Rows Endpoints

### GET /upload/flagged
Query: `reseller_id`, `status` (default: `pending`)

For each flagged row, hydrate `candidate_ids` by fetching the actual records:
- `AMBIGUOUS_CUSTOMER` → fetch from `master_customer`
- `AMBIGUOUS_SUBSCRIPTION` → fetch from `external_subscription`

Return hydrated candidates in the response — not bare UUIDs.

### POST /upload/flagged/:id/resolve
Body: `{ candidate_id, resolved_by }`

Load `raw_row` from the flagged row. Write it to master tables using
the selected candidate as the anchor — reuse the same processor logic
the worker uses. Set `status='resolved'`, `resolved_by`, `resolved_at=now()`.

### POST /upload/flagged/:id/dismiss
Body: `{ resolved_by }`

Load `raw_row`. Create a new record from it without matching any
existing record (same as the INSERT path in the worker).
Set `status='dismissed'`, `resolved_by`, `resolved_at=now()`.

---

## Upload History Endpoint

### GET /upload/history
Query: `reseller_id`

Returns all `upload_log` rows for this reseller ordered by `uploaded_at DESC`.

---

## Frontend

### UploadPage
Renders `UploadForm`. On upload success receives `job_id` and switches to
`ProgressView`. After done, offers to upload another file (reset state).

### UploadForm
File input: `accept=".xlsx,.csv"`. Validate before calling API:
- File selected
- Extension is `.xlsx` or `.csv`
- Size under 50MB

On submit: POST to `/upload` as multipart. Disable button, show spinner.
On 400: show `message` from response body inline.
On 200: call `onSuccess(job_id)` to parent.

### ProgressView
Props: `jobId`

Uses `useUploadProgress(jobId)` to get `{ pct, status, counters }`.

Displays:
- Progress bar (0–100%)
- Status label: Queued / Processing / Done / Failed
- Counters once `rows_total` is known: Total · Created · Enriched · Skipped · Flagged
- After done: if `rows_flagged > 0` show callout "X rows need your review" + link
- After done: show "Upload another file" button

Progress bar states:
- `queued` → indeterminate pulse animation (CSS, not pct-based)
- `processing` → filled to `pct`%
- `done` → full, green
- `failed` → stopped at last pct, red, show error message
- `disconnected` → grey, show "Connection lost — refresh to check status"

### useUploadProgress hook
```typescript
function useUploadProgress(jobId: string) {
  // Opens EventSource('/upload/progress/' + jobId)
  // Returns { pct, status, counters, errorMessage }
  // Updates state on every SSE message
  // Calls sse.close() when status is 'done' or 'failed'
  // Calls sse.close() on unmount (cleanup)
  // Sets status to 'disconnected' on sse.onerror
}
```

### FlaggedRowsPage
Fetches `GET /upload/flagged?reseller_id=...&status=pending`.
Renders one `FlaggedRowCard` per row. Shows empty state when none remain.

### FlaggedRowCard
Props: flagged row with hydrated candidates

Shows:
- `reason_detail` text explaining the ambiguity
- Raw row fields that are relevant to the reason:
  - Both reasons: `account_name`, `subscription_name`, `licenses_count`, `subscription_end_date`
- Candidate cards with fields by reason type:
  - `AMBIGUOUS_CUSTOMER`: `customer_name`, `country_name`, `customer_tpid`
  - `AMBIGUOUS_SUBSCRIPTION`: `subscription_name`, `licenses_count`, `subscription_end_date`, `account_name`, `partner_name`
- "Use this record" button per candidate → calls resolve, removes card, shows toast
- "Create as new record" button → calls dismiss, removes card, shows toast

### UploadHistoryTable
Fetches `GET /upload/history?reseller_id=...`.

Columns: File name · Source type (readable label) · Uploaded at · Status badge ·
Created / Enriched / Skipped / Flagged

On row click:
- `status = processing` → navigate to `ProgressView`, open SSE with `job_id`
- `status = done/failed` → navigate to `ProgressView` with static data from
  history row (no SSE — job already complete)

---

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
REDIS_HOST=localhost
REDIS_PORT=6379
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_BYTES=52428800
```

---

## Testing Checklist

### Upload endpoint
- [ ] Returns under 200ms regardless of file size
- [ ] Rejects unrecognized format with 400, file deleted from disk
- [ ] Rejects duplicate file with 400, file deleted from disk
- [ ] upload_log created with status = queued
- [ ] job_id stored on upload_log after enqueue

### Worker
- [ ] status transitions: queued → processing → done
- [ ] status = failed and error_message set on error
- [ ] File deleted in finally block on success and failure
- [ ] file_path cleared on upload_log after deletion
- [ ] Rows processed one at a time in sequence

### Progress
- [ ] Redis written every 10 rows
- [ ] pct increases monotonically 0 → 100
- [ ] Redis TTL is 3600 seconds
- [ ] SSE returns queued state before worker starts
- [ ] SSE emits done with final counters
- [ ] SSE emits failed with error message
- [ ] Client disconnect clears interval, no dangling timers

### Distributor
- [ ] Created on first upload
- [ ] Enriched, not duplicated, on second upload
- [ ] CLAS_MICROSOFT wins over RENEWAL_MICROSOFT on conflict

### Partner
- [ ] Match on global_id
- [ ] Match on name when global_id absent
- [ ] Match on one_id when both absent
- [ ] Name-matched record gains global_id from CLAS upload

### Customer
- [ ] Match on TPID
- [ ] Match on name + country when no TPID
- [ ] RENEWAL_PARTNER name match, 1 result → enrich
- [ ] RENEWAL_PARTNER name match, 2+ results → flagged row, no write

### Subscription
- [ ] New record on first renewal upload
- [ ] Enriched, not duplicated, on second renewal upload
- [ ] "O365 - M365 Business Premium" matches "Microsoft 365 Business Premium"
- [ ] Two products for same customer → two separate rows
- [ ] CLAS enriches CLAS fields on existing records
- [ ] CLAS creates stub when no subscription exists
- [ ] CLAS enriches ALL subscriptions under customer+partner
- [ ] Stub promoted when renewal arrives
- [ ] 2+ matching subscriptions → flagged row, no write

### Flagged rows
- [ ] AMBIGUOUS_CUSTOMER saved with correct candidateIds and detail
- [ ] AMBIGUOUS_SUBSCRIPTION saved with correct candidateIds and detail
- [ ] GET /flagged returns hydrated candidates not bare UUIDs
- [ ] Resolve writes raw_row to master using selected candidate
- [ ] Dismiss creates new record from raw_row
- [ ] Both set status, resolved_by, resolved_at

### Frontend — Upload
- [ ] Extension and size validation before submit
- [ ] Loading state during POST
- [ ] 400 error shown inline
- [ ] Transitions to progress view on 200

### Frontend — Progress
- [ ] Bar updates as SSE events arrive
- [ ] Correct label per status
- [ ] Counters shown during and after processing
- [ ] Flagged callout shown when rows_flagged > 0
- [ ] SSE closed on done, failed, and unmount
- [ ] Disconnection message on sse.onerror

### Frontend — Flagged rows
- [ ] Only pending rows for this reseller shown
- [ ] Correct candidate fields per reason type
- [ ] Resolve removes card and shows toast
- [ ] Dismiss removes card and shows toast
- [ ] Empty state when none remain

### Frontend — History
- [ ] All uploads shown newest first
- [ ] In-progress upload opens SSE on click
- [ ] Completed upload shows static summary on click
