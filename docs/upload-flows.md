# Upload Flows — Column & Scenario Reference

This document is a code-grounded reference for verifying upload guardrails on each of the five upload sources. For higher-level rules (matching algorithm, partner compatibility, ambiguity flagging UX), see `[dedup-and-enrichment-rules.md](./dedup-and-enrichment-rules.md)`.

---

## Sources & detection

There are **5 detected upload sources**, not 3. CLAS and Renewals each have a Partner-side and Microsoft-side variant, detected by header columns:


| Source                 | Detected by header columns                                                                                                                                                                   | Mapper file                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `CLAS_PARTNER`         | `PartnerName`, `GlobalID`, `CustomerID`, `AccountName`, `Country`, `M365_CoPilot_Fit`, `M365_CoPilot_Intent`, `M365_CoPilot_Cluster`, `Has_MW_CSP_Annual_Renewal`                            | `apps/api/src/upload/column-mappers/clas-partner.mapper.ts`                                |
| `CLAS_MICROSOFT`       | `Distributor Name`, `Partner Name (Reseller Name)`, `Partner Global ID`, `Partner One ID`, `CustomerTPID`, `Account Name`, `Copilot Fit`, `Copilot Intent`, `Copilot Cluster`, `TenantIDs`   | `apps/api/src/upload/column-mappers/clas-microsoft.mapper.ts`                              |
| `RENEWAL_PARTNER`      | `PGAMpnId`, `MpnId`, `CustomerName`, `SubscriptionName`, `LicensesCount`, `SubscriptionEndDate`                                                                                              | `apps/api/src/upload/column-mappers/renewal-partner.mapper.ts`                             |
| `RENEWAL_MICROSOFT`    | `Distributor Name (From)`, `Reseller Name (From)`, `TPID`, `Customer Name`, `Expiration Ending Product`, `Expiration Ending Seats`, `Subscription End Date`, `Type`, `Distributor ID (From)` | `apps/api/src/upload/column-mappers/renewal-microsoft.mapper.ts`                           |
| `ASPX` (separate flow) | flexible header aliases — needs `customerTpid` + at least one enrichment field                                                                                                               | `apps/api/src/reseller-subscription-enrichment/reseller-subscription-enrichment.mapper.ts` |


Detection order in `source-detector.ts`: `RENEWAL_MICROSOFT` → `RENEWAL_PARTNER` → `CLAS_MICROSOFT` → `CLAS_PARTNER` → `CUSTOM`. First match wins.

CLAS and Renewal share the same upload pipeline (4 phases: distributor → partner → customer → subscription, then `postUploadEnrich`). **ASPX is a separate worker entirely** with different match logic.

---

## CLAS-Partner

### Columns read


| Sheet header                                          | MappedRow field        | Notes                                                  |
| ----------------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| `PartnerName`                                         | `partnerName`          | trim                                                   |
| `GlobalID`                                            | `partnerGlobalId`      | trim                                                   |
| `CustomerID`                                          | `customerTpid`         | trim                                                   |
| `AccountName`                                         | `accountName`          | **required**                                           |
| `Country`                                             | `countryName`          | trim                                                   |
| `M365_CoPilot_Fit`                                    | `copilotFit`           | trim                                                   |
| `M365_CoPilot_Intent`                                 | `copilotIntent`        | trim                                                   |
| `M365_CoPilot_Cluster`                                | `copilotCluster`       | trim                                                   |
| `MW CSP Annual Renewal` / `Has_MW_CSP_Annual_Renewal` | `mwCspAnnualRenewal`   | trim, fallback aliases                                 |
| `M365_Paid_Seat_Range`                                | `mwPaidSeatRange`      | trim                                                   |
| `Has_Transacted_Product`                              | `hasTransactedProduct` | trim                                                   |
| `Has_Compete`                                         | `hasCompete`           | trim                                                   |
| `Org Size`                                            | `licensesCount`        | `parseOrgSize()` — "25-49" → 25; lower≥300 → undefined |


### Validation

- `AccountName` missing → row rejected with `"AccountName is required"`.
- That's the only hard validation for this source.

### Scenario A — new customer (no master row)

1. **distributor** — skipped entirely. CLAS_PARTNER has `matchBy: []`, `canCreate: false`.
2. **partner** — `matchBy: [globalId, name]`, `canCreate: true`. Tries `globalId` first, then `name`. No match → inserts `master_partners` with `id=randomUUID()`, `globalId`, `name`. `mpnId` stays null (not in CLAS_PARTNER mapping).
3. **customer** — `matchBy: [customerTpid, accountName]`, `canCreate: true`. Tries TPID, then case-insensitive name. No match → inserts `master_customers` with `id`, `customerTpid`, `customerName=accountName`, `countryName`.
4. **subscription** — `customer: [customerTpid, accountName]`, `partner: [partnerName, partnerGlobalId]`, `subscription: []`, `canCreate: true`. Since CLAS has empty subscription matchBy, this **always creates a stub subscription**: `external_subscriptions` row with `source='partner_center_upload'`, `**subscriptionName=null`**, `**type=null**`, plus all CLAS attribute columns (`copilotFit/Intent/Cluster`, `mwCspAnnualRenewal`, `mwPaidSeatRange`, `hasTransactedProduct`, `hasCompete`, `licensesCount`, `customerTpid`, `accountName`, `countryName`, `partnerName`, `partnerGlobalId`).

### Scenario B — customer exists, enrich

1. **partner** match found → fill-empty-only on `globalId`, `name`, `mpnId`. Existing non-null values are NEVER overwritten.
2. **customer** match found via TPID or name:
  - `customerTpid` filled if row has it and existing is null
  - `countryName` is **always overwritten** if row has a value (this is the one exception to fill-empty-only)
  - `customerName` updated only if the row's `accountName` differs from existing
3. **subscription** — fetches all `external_subscriptions` for that `(orgId, customerTpid OR accountName)` and filters by partner-compatibility. Because CLAS has empty subscription matchBy, **every existing subscription for that customer that matches partner is enriched** by `enrichClas`. CLAS is **pure fill-empty-only** — it never overwrites a non-null column:
  - **Fill-empty-only**: `copilotFit`, `copilotIntent`, `copilotCluster`, `mwCspAnnualRenewal`, `mwPaidSeatRange`, `hasTransactedProduct`, `hasCompete`, `tenantIds`, `licensesCount`, `subscriptionEndDate`, `distributorName`, `partnerName`, `partnerGlobalId`, `mpnId`, `customerTpid`, `countryName`
  - **Never updated**: `subscriptionName`, `type` (CLAS rows leave these for Renewal uploads to fill)

### Scenario C — same customer has multiple subscriptions in the sheet

CLAS sheets always have one row per customer, so this is rare. If it does happen: because subscription matchBy is empty, **both rows enrich/upsert the same set of existing subscriptions**. If no subscription exists yet, the first row creates a stub; the second row's data then enriches that stub via `enrichClas` — but since CLAS is fill-empty-only, the second row only fills columns the first row left null. **First-write-wins** for any column.

Ambiguity flag possibilities: only on `customer` (multiple master rows match the name) → emits `flagged_rows` with `reason='AMBIGUOUS_CUSTOMER'`, `reasonDetail="Multiple customers match name \"...\""`, and the input row is skipped (no subscription created/updated).

---

## CLAS-Microsoft

### Columns read


| Sheet header                         | MappedRow field             | Notes            |
| ------------------------------------ | --------------------------- | ---------------- |
| `Distributor Name`                   | `distributorName`           | trim             |
| `Partner Name (Reseller Name)`       | `partnerName`               | trim             |
| `Partner Global ID`                  | `partnerGlobalId`           | trim             |
| `Partner One ID`                     | `mpnId`                     | trim             |
| `CustomerTPID`                       | `customerTpid`              | trim             |
| `Account Name`                       | `accountName`               | **required**     |
| `Country Name`                       | `countryName`               | trim             |
| `Copilot Fit` / `Intent` / `Cluster` | `copilotFit/Intent/Cluster` | trim             |
| `MW CSP Annual Renewal`              | `mwCspAnnualRenewal`        | trim             |
| `MW Paid Seat Range`                 | `mwPaidSeatRange`           | trim             |
| `Has Transacted Product`             | `hasTransactedProduct`      | trim             |
| `Has Compete`                        | `hasCompete`                | trim             |
| `TenantIDs`                          | `tenantIds`                 | trim             |
| `Org Size`                           | `licensesCount`             | `parseOrgSize()` |


### Validation

- `Account Name` missing → `"Account Name is required"`. No other hard validation.

### Scenario A — new customer

1. **distributor** — `matchBy: [name]`, `canCreate: true`. Inserts `master_distributors` with `id`, `name` (`distributorId` stays null since this source doesn't carry it).
2. **partner** — `matchBy: [globalId, name, mpnId]`, `canCreate: true`. Tries each in order. Insert covers all three identifiers.
3. **customer** — `matchBy: [customerTpid, accountName]`, `canCreate: true`. Insert covers `customerTpid`, `customerName`, `countryName`.
4. **subscription** — same as CLAS-Partner: empty subscription matchBy, creates a stub with `subscriptionName=null`, `type=null`, `source='microsoft'`, plus all CLAS attribute columns.

### Scenario B — enrichment

Same as CLAS-Partner: pure fill-empty-only. Note CLAS-Microsoft additionally fills `tenantIds` and `distributorName` when those are empty on the existing record.

### Scenario C — multiple subscriptions

Same as CLAS-Partner: empty subscription matchBy means all matching subscriptions for that customer get enriched, but only their empty columns. **First-write-wins** for any column. Ambiguity → `AMBIGUOUS_CUSTOMER`.

---

## Renewal-Partner

### Columns read


| Sheet header          | MappedRow field       | Notes                                                |
| --------------------- | --------------------- | ---------------------------------------------------- |
| `PGAMpnId`            | `partnerGlobalId`     | trim                                                 |
| `MpnId`               | `mpnId`               | trim                                                 |
| `CustomerName`        | `accountName`         | **required**                                         |
| `SubscriptionName`    | `subscriptionName`    | trim, validated against allow-list                   |
| `LicensesCount`       | `licensesCount`       | `parseSeats()` — capped at 300, undefined if invalid |
| `SubscriptionEndDate` | `subscriptionEndDate` | trim                                                 |


### Validation

- `CustomerName` missing → `"CustomerName is required"`.
- `SubscriptionName` missing OR not containing one of `Business Basic` / `Business Standard` / `Business Premium` (case-insensitive substring) → `ALLOWED_SUBSCRIPTION_NAME_ERROR`. Empty values now reject for Renewal sources (allow-list in `apps/api/src/upload/column-mappers/subscription-name.ts` — `isRequiredAllowedSubscriptionName`).

### Scenario A — new customer

1. **distributor** — skipped (`matchBy: []`).
2. **partner** — `matchBy: [globalId, mpnId]`, `canCreate: true`. Insert covers `globalId`, `mpnId` (no name in this source).
3. **customer** — `matchBy: [accountName]`, `canCreate: true`. TPID is not in this source, so name is the only key. Insert: `customerName=accountName`. Will be enriched with TPID later by `postUploadEnrich`.
4. **subscription** — `customer: [accountName]`, `partner: [partnerGlobalId, mpnId]`, `subscription: [subscriptionName]`, `canCreate: true`. With non-empty subscription matchBy, the processor:
  - normalizes the subscription name (strips `O365`, `Microsoft 365`, `M365`, `Office 365` prefixes)
  - filters partner-compatible candidates
  - tries to find a match by normalized name; also tries to claim a CLAS stub with null/empty `subscriptionName`
  - 0 matches → inserts a real subscription row with `source='partner_center_upload'`, `subscriptionName`, `licensesCount`, `subscriptionEndDate`, plus partner/customer fields

### Scenario B — enrichment

Subscription match found → `enrichRenewal`:

- **Fill-empty-only**: `distributorName`, `distributorId`, `partnerName`, `partnerGlobalId`, `mpnId`, `customerTpid`, `countryName`, `type`, `subscriptionName` (only if existing was null/empty — important: claims a CLAS stub by writing the name into it)
- **Always overwrite**: `licensesCount`, `subscriptionEndDate` (renewal data should always be most current)
- **Visibility**: if after the update the row has both `subscriptionName` and `licensesCount` non-null, `dashboard_visible` is set to `true`. This is what makes a CLAS-big-org or ASPX-hidden row appear on the dashboard once a Renewal touches it.

### Scenario C — same customer, two subscriptions in the sheet

Two Renewal-Partner rows, same customer:

- **Different subscription names** → both rows pass through subscription matching; first inserts row 1, second inserts row 2 (or claims a different stub). When inserting, the new row's empty CLAS-attribute columns (Copilot fit/intent/cluster, MW status, has-compete, partner/distributor identifiers, `dominantSkuGroup`) are **backfilled from the customer's existing rows** — the most recent non-null value across siblings. End state: customer has 2 distinct subscription rows, both carrying the same enrichment context.
- **Same subscription name** → first row inserts (or enriches existing); second row matches the just-created/enriched row → second row's `licensesCount` / `subscriptionEndDate` overwrite first row's values (last-write-wins on the always-overwrite columns). `subscriptionName` stays as the existing value (fill-empty-only).
- **Ambiguity** — if name match returns 2+ existing rows → `flagged_rows` with `reason='AMBIGUOUS_SUBSCRIPTION'`, `reasonDetail="Multiple subscriptions match for \"<accountName>\" - \"<subscriptionName>\""`. The input row is skipped — no insert, no update.

---

## Renewal-Microsoft

### Columns read


| Sheet header                | MappedRow field       | Notes                        |
| --------------------------- | --------------------- | ---------------------------- |
| `Distributor Name (From)`   | `distributorName`     | trim                         |
| `Distributor ID (From)`     | `distributorId`       | trim                         |
| `Reseller Name (From)`      | `partnerName`         | trim                         |
| `TPID`                      | `customerTpid`        | trim                         |
| `Customer Name`             | `accountName`         | **required**                 |
| `Region`                    | `countryName`         | trim                         |
| `Expiration Ending Product` | `subscriptionName`    | validated against allow-list |
| `Expiration Ending Seats`   | `licensesCount`       | `parseSeats()`               |
| `Subscription End Date`     | `subscriptionEndDate` | trim                         |
| `Type`                      | `type`                | trim                         |


### Validation

- `Customer Name` missing → `"Customer Name is required"`.
- `Expiration Ending Product` missing OR not containing one of `Business Basic` / `Business Standard` / `Business Premium` (case-insensitive substring) → `ALLOWED_SUBSCRIPTION_NAME_ERROR`. Empty values reject.

### Scenario A — new customer

1. **distributor** — `matchBy: [distributorId, name]`, `canCreate: true`. Insert covers `distributorId`, `name`.
2. **partner** — `matchBy: [name]`, `canCreate: true`. Insert covers `name` only.
3. **customer** — `matchBy: [customerTpid, accountName]`, `canCreate: true`. TPID match has priority; falls back to name. Insert covers `customerTpid`, `customerName`, `countryName`.
4. **subscription** — same as Renewal-Partner: subscription matchBy is `[subscriptionName]`, so a real subscription row gets inserted (or a CLAS stub gets claimed).

### Scenario B — enrichment

Same fill-empty-only / always-overwrite split as Renewal-Partner, including the visibility flip when `subscriptionName` + `licensesCount` end up populated. Distributor and `partnerName` get backfilled into the subscription row from the wider column set.

### Scenario C — multiple subscriptions per customer

Same as Renewal-Partner, including the **sibling-row CLAS backfill** when inserting a new subscription row for an existing customer. Note the distinction: because Renewal-Microsoft has TPID, customer matching is much more reliable across sheets than Renewal-Partner's name-only match.

---

## Ambiguity flags — summary

Only **customer** and **subscription** can be flagged. Distributor and partner can never be flagged because their queries use `.limit(1)`.


| Flag                     | When                                                                                                                                                          | What happens to the row                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `AMBIGUOUS_CUSTOMER`     | 2+ `master_customers` rows match by case-insensitive name                                                                                                     | Skipped — no subscription created/updated. Logged in `flagged_rows`. |
| `AMBIGUOUS_SUBSCRIPTION` | 2+ `external_subscriptions` rows match by partner-compatibility + normalized subscription name (Renewal sources only — CLAS empty matchBy can't trigger this) | Skipped — no insert/update. Logged in `flagged_rows`.                |


A flagged row never updates anything. It needs human resolution via the flagged-rows UI.

---

## Cross-source backfill — `postUploadEnrich`

Runs once at the end of every upload (after all rows are processed) on `external_subscriptions` for the upload's `orgId`. Six categories, all fill-empty-only:

1. `accountName` set, `customerTpid` null → look up `master_customers` by name → fill `customerTpid` (and `countryName` if also missing)
2. `customerTpid` set, `accountName` null → look up by TPID → fill `accountName` (and `countryName`)
3. `partnerName` set, `partnerGlobalId` null → look up `master_partners` by name → fill `partnerGlobalId`, `mpnId`
4. `partnerGlobalId` set, `partnerName` null → look up by `globalId` → fill `partnerName`, `mpnId`
5. `distributorName` set, `distributorId` null → look up `master_distributors` by name → fill `distributorId`
6. `distributorId` set, `distributorName` null → look up by ID → fill `distributorName`

This is what makes a Renewal-Partner upload (which has no TPID) end up with TPIDs filled in — provided a CLAS upload has previously seeded `master_customers` with the TPID for that name.

---

## ASPX (separate enrichment flow)

Different worker, different queue, different mapper. Lives under `apps/api/src/reseller-subscription-enrichment/`.

### Columns read (flexible aliases — case-insensitive, whitespace-normalized)


| Field                      | Accepted headers                                                    |
| -------------------------- | ------------------------------------------------------------------- |
| `customerTpid`             | `customer tpid`, `tpid`, `customer id` (**required**)               |
| `accountName`              | `customer name`, `account name`, `tenant name`                      |
| `countryName`              | `tenant country/region`, `country`, `country/region`                |
| `tenantIds`                | `tenant id`, `tenant ids`                                           |
| `subscriptionEndDate`      | `largest seat csp renewal`, `subscription end date`, `renewal date` |
| `copilotEligibleM365Seats` | `copilot eligible m365 seats`, `copilot eligible seats`             |
| `copilotSeatsWhitespace`   | `copilot seats whitespace`, `copilot whitespace`                    |
| `adoptionStatus`           | `adoption status`                                                   |
| `freeCopilotChatMAU`       | `free copilot chat mau (unlicensed)`, `free copilot chat mau`       |
| `allAgentMAU`              | `all agents mau`, `all agent mau`                                   |
| `mciEligibility`           | `mci eligibility`                                                   |
| `partnerName`              | `t2 reseller name`, `partner name`                                  |
| `mciEngagementName`        | `mci engagement name`                                               |
| `dominantSkuGroup`         | `dominant sku group`                                                |


`copilotMAUPercentage` is **derived** server-side as `freeCopilotChatMAU / copilotEligibleM365Seats` when both are present.

### Validation

- `customerTpid` is required (per row).
- At least one enrichment field besides `customerTpid` must be present (otherwise the row has nothing to do).

### Match key

**Only `customerTpid`** — looks up all `external_subscriptions` rows where `(orgId, customerTpid)` match.

### Scenario A — no subscription exists for that TPID

Inserts **one new** `external_subscriptions` row with `source='aspx-enrichment'`, `subscriptionName=null`, `customerTpid`, plus every populated enrichment field including `dominantSkuGroup`. Counted as `unmatched` in the progress payload.

**Visibility on insert:** `dashboard_visible` is set to `false` if either:
- `copilotEligibleM365Seats > 300`, OR
- `dominantSkuGroup` is set and is **not** one of `BP` / `BS` / `BB` (case-insensitive, after trim).

Otherwise `dashboard_visible = true`. The row is still stored and still available for enrichment — it just doesn't show on the dashboard until a Renewal upload sets `subscriptionName + licensesCount` (which flips the flag back to true via `enrichRenewal`).

### Scenario B — subscriptions exist for that TPID

**Enriches every matching subscription** (one ASPX row → potentially many subscription updates). Fill-empty-only on every column. Counted as `matched`. ASPX enrichment never flips `dashboard_visible` to false — only the initial insert sets it.

### Scenario C — two ASPX rows for the same customer (same TPID)

Each row is processed independently against current DB state. The second row's fill-empty-only logic applies *after* the first row's writes — so the second row's values only win for columns the first row didn't fill. It is **not** last-write-wins like CLAS — it's true fill-empty-only.

### Progress payload

- `processed` / `total` — rows attempted vs total in file
- `matched` — rows whose TPID found ≥1 existing subscription
- `unmatched` — rows with missing/empty TPID OR TPID not found (these triggered an insert)
- `updated` — count of subscription rows actually written to (one ASPX row can update many)

---

## Dashboard visibility (`dashboard_visible` flag)

Every `external_subscriptions` row carries a `dashboard_visible` boolean (default `true`). The reseller-customers dashboard query filters on `dashboard_visible = true` — hidden rows are still stored and still participate in enrichment, they just don't appear in the customer list until they're "completed".

### When a row is inserted hidden (`dashboard_visible = false`)

| Source | Hidden if |
|---|---|
| CLAS-Partner / CLAS-Microsoft | Both bounds of `Org Size` strictly exceed 300 (e.g. `500-999`). `300-499` and below stay visible. |
| ASPX | `Copilot Eligible M365 Seats > 300`, OR `Dominant SKU Group` is set and not one of `BP` / `BS` / `BB`. |
| Renewal-Partner / Renewal-Microsoft | Never. Renewal inserts default visible. |

### When a hidden row becomes visible again

`enrichRenewal` flips `dashboard_visible = true` whenever the post-update row state has both `subscriptionName` non-null and `licensesCount` non-null. This is the only path that transitions a hidden row to visible.

CLAS enrichment never touches `dashboard_visible`. ASPX enrichment never touches `dashboard_visible`. Only the initial insert sets it false; only Renewal-driven enrichment flips it back.

### Backfill on legacy data

The migration defaults all existing rows to `dashboard_visible = true`. No backfill is run — existing rows behave as before.

---

## Quick column ownership matrix

Useful for "which upload should I use to set X?" decisions. **W** = always overwrite, **F** = fill-empty-only, **N** = inserted on creation only, **—** = not touched by this source.


| `external_subscriptions` column           | CLAS-Partner | CLAS-Microsoft | Renewal-Partner | Renewal-Microsoft | ASPX        |
| ----------------------------------------- | ------------ | -------------- | --------------- | ----------------- | ----------- |
| `subscriptionName`                        | —            | —              | F               | F                 | —           |
| `type`                                    | —            | —              | F               | F                 | —           |
| `licensesCount`                           | F            | F              | **W**           | **W**             | F           |
| `subscriptionEndDate`                     | F            | F              | **W**           | **W**             | F           |
| `copilotFit` / `Intent` / `Cluster`       | F            | F              | —               | —                 | —           |
| `mwCspAnnualRenewal` / `mwPaidSeatRange`  | F            | F              | —               | —                 | —           |
| `hasTransactedProduct` / `hasCompete`     | F            | F              | —               | —                 | —           |
| `tenantIds`                               | F            | F              | —               | —                 | F           |
| `copilotEligibleM365Seats` / `Whitespace` | —            | —              | —               | —                 | F           |
| `freeCopilotChatMAU` / `allAgentMAU`      | —            | —              | —               | —                 | F           |
| `mciEligibility` / `EngagementName`       | —            | —              | —               | —                 | F           |
| `adoptionStatus`                          | —            | —              | —               | —                 | F           |
| `dominantSkuGroup`                        | —            | —              | —               | —                 | F           |
| `copilotMAUPercentage`                    | —            | —              | —               | —                 | derived     |
| `customerTpid`                            | F            | F              | F               | F                 | (match key) |
| `accountName`                             | F            | F              | F               | F                 | F           |
| `countryName`                             | F            | F              | F               | F                 | F           |
| `partnerName`                             | F            | F              | F               | F                 | F           |
| `partnerGlobalId`                         | F            | F              | F               | F                 | —           |
| `mpnId`                                   | F            | F              | F               | F                 | —           |
| `distributorName`                         | F            | F              | F               | F                 | —           |
| `distributorId`                           | —            | —              | F               | F                 | —           |
| `dashboardVisible`                        | set on insert (false if `Org Size` > 300) | set on insert (false if `Org Size` > 300) | flipped to true when name+seats present | flipped to true when name+seats present | set on insert (false if seats > 300 or SKU not in BP/BS/BB) |


CLAS owns the *opportunity intelligence* columns (Copilot fit, MW status, has-compete) and writes them as a fill-empty source — never overwriting an existing value. Renewal owns the *subscription state* columns (seats, end date, type, name): seats and end date are always-overwrite, name is fill-empty so an earlier Renewal isn't clobbered. ASPX layers on adoption/MAU columns plus the `dominantSkuGroup` signal used for visibility gating. Each source is fill-empty for everything outside its lane.

---

## See also

- `[dedup-and-enrichment-rules.md](./dedup-and-enrichment-rules.md)` — higher-level rules, partner-compatibility logic, ambiguity UX
- `apps/api/src/upload/dedup-config.ts` — single source of truth for `matchBy` arrays per source

