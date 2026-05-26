# Deduplication & Enrichment Rules

## Overview

When files are uploaded, the system processes each row to avoid creating duplicate records. It checks existing data, and if a match is found, it **enriches** the existing record with any missing fields instead of creating a new one. If no match is found, a new record is created.

This applies across all source types:

| Source | Description |
|--------|-------------|
| **Microsoft Renewal** | Renewal list from Microsoft (has Distributor, Reseller Name, TPID, Customer Name, Product, Seats, End Date, Type) |
| **Partner Center Renewal** | Renewal export from Partner Center (has PGAMpnId, MpnId, CustomerName, SubscriptionName, LicensesCount, EndDate) |
| **CLAS Microsoft** | Copilot/AI enrichment from Microsoft (has Distributor, Partner Name, Partner Global/One ID, TPID, Account Name, CLAS fields) |
| **CLAS Partner** | Copilot/AI enrichment from Partner Center (has PartnerName, GlobalID, CustomerID, AccountName, CLAS fields) |
| **Custom CSV** | Generic CSV/Excel upload (has Customer Name, Country, optional partner/subscription info) |

---

## 1. Subscription Deduplication (external_subscriptions)

### Matching Steps

1. **Find candidates by customer** -- Look up all existing records in the same org that match by Customer TPID or Account Name
2. **Narrow by subscription name** -- Compare the subscription/product name after normalizing (stripping prefixes like "O365 - ", "Microsoft 365 ", "M365 ", "Office 365 " so that "O365 - M365 Business Basic" and "Microsoft 365 Business Basic" both resolve to "Business Basic")
3. **Narrow by partner** -- Check if the partner is the same (see Partner Compatibility below)
4. **Decide**: 0 matches = create new | 1 match = enrich existing | 2+ matches = flag as ambiguous for user review

### CLAS Sources (No Subscription Identity)

CLAS files don't have subscription-level data (no product name, seats, or end date). They only carry enrichment fields (Copilot Fit, Intent, Cluster, etc.). For these:

- Match by **customer + partner only** (skip subscription name step)
- **Enrich ALL matching records** with CLAS fields
- If no match exists, create a stub record with CLAS data only

### Which Columns Each Source Uses to Match

| Source | Customer Match | Partner Match | Subscription Match |
|--------|---------------|---------------|-------------------|
| Microsoft Renewal | TPID, Account Name | Partner Name | Subscription Name |
| Partner Center Renewal | Account Name | Partner Global ID, Partner One ID | Subscription Name |
| CLAS Microsoft | TPID, Account Name | Partner Name, Global ID, One ID | _(none -- enriches all)_ |
| CLAS Partner | TPID, Account Name | Partner Name, Global ID | _(none -- enriches all)_ |
| Custom CSV | Account Name | _(none)_ | Subscription Name |

### What Gets Enriched on Match

When a subscription record is matched, the following fields are filled in **only if they are currently empty** on the existing record:

- Distributor Name, Distributor ID
- Partner Name, Partner Global ID, Partner One ID
- Customer TPID
- Country
- Type (2-Tier, etc.)
- Licenses Count, Subscription End Date

CLAS matches additionally enrich: Copilot Fit, Copilot Intent, Copilot Cluster, MW CSP Annual Renewal, MW Paid Seat Range, Has Transacted Product, Has Compete, Tenant IDs.

---

## 2. Partner Compatibility Rules

When deciding whether an incoming row refers to the **same partner** as an existing record, the system compares partner identifiers (Global ID, One ID, Name) with these rules:

### Per Identifier Type (Global ID / One ID / Name)

| Incoming Row | Existing Record | Verdict |
|-------------|----------------|---------|
| Has value "X" | Has same value "X" | **Same partner** |
| Has value "X" | Has different value "Y" | **Different partner** |
| Has value "X" | Is NULL / empty | **Unknown** (can't tell) |
| Is NULL / empty | Has value "Y" | **Unknown** (can't tell) |
| Is NULL / empty | Is NULL / empty | **Unknown** (can't tell) |

### Overall Decision

| Condition | Result |
|-----------|--------|
| **Any** identifier says "Same partner" | **Enrich** (same partner confirmed) |
| **Any** identifier says "Different partner" AND **none** say "Same" | **Create new record** (different reseller) |
| **All** identifiers are "Unknown" | **Enrich** (can't tell, so merge to avoid duplicates) |

### Example: Microsoft Renewal then Partner Center Upload

- Microsoft record has: `partnerName = "All Net Inc"`, `partnerGlobalId = NULL`
- Partner Center row has: `partnerName = NULL`, `partnerGlobalId = "1166415"`
- Global ID: row has value, record is NULL --> Unknown
- One ID: row has value, record is NULL --> Unknown
- Name: row is NULL, record has value --> Unknown
- **All unknown --> Enrich** (the Partner Center data fills in the missing Global ID and One ID)

### Example: Two Different CSP Partners

- Existing record: `partnerName = "Reseller A"`
- Incoming row: `partnerName = "Reseller B"`
- Name: both have values, values differ --> **Different partner**
- **Create new record** (genuinely different reseller)

---

## 3. Master Table Deduplication

### Customer (master_customers)

| Source | Match By | Can Create New? |
|--------|----------|----------------|
| Microsoft Renewal | TPID, then Account Name | Yes |
| Partner Center Renewal | Account Name | Yes |
| CLAS Microsoft | TPID, then Account Name | Yes |
| CLAS Partner | TPID, then Account Name | Yes |
| Custom CSV | Account Name | Yes |

**Rules:**
- TPID is the strongest identifier. If TPID matches, enrich the existing record (update name/country if changed).
- If no TPID match, try Account Name (case-insensitive). If exactly 1 match, enrich it. If 2+ matches, flag as ambiguous.
- If no match at all, create a new master customer record.

### Partner (master_partners)

| Source | Match By | Can Create New? |
|--------|----------|----------------|
| Microsoft Renewal | Name | Yes |
| Partner Center Renewal | Global ID, One ID | **No** (only has IDs, no name -- enrich only) |
| CLAS Microsoft | Global ID, Name, One ID | Yes |
| CLAS Partner | Global ID, Name | Yes |
| Custom CSV | _(skipped)_ | No |

**Rules:**
- Search existing partners by the identifiers available from the source (in priority order listed above).
- If found, enrich the existing partner record with any missing identifiers (e.g., add Global ID to a partner that only had a Name).
- If not found and `canCreate = Yes`, create a new partner record.
- **Partner Center Renewal cannot create** new partner records because it only provides PGAMpnId/MpnId but no partner name. It can only enrich an existing partner that was previously created by Microsoft or CLAS uploads.

### Distributor (master_distributors)

| Source | Match By | Can Create New? |
|--------|----------|----------------|
| Microsoft Renewal | Distributor ID, Name | Yes |
| Partner Center Renewal | _(skipped)_ | No (no distributor info) |
| CLAS Microsoft | Name | Yes |
| CLAS Partner | _(skipped)_ | No (no distributor info) |
| Custom CSV | _(skipped)_ | No |

---

## 4. Post-Upload Enrichment

After every file upload completes, a post-processing step runs across **all records in the organization** (not just the rows from the current upload). It backfills missing identifiers by looking them up in the master tables:

| Record Has | Record Missing | Lookup | Fields Filled |
|-----------|---------------|--------|--------------|
| Account Name | Customer TPID | Search master_customers by name | TPID, Country |
| Customer TPID | Account Name | Search master_customers by TPID | Name, Country |
| Partner Name | Partner Global ID | Search master_partners by name | Global ID, One ID |
| Partner Global ID | Partner Name | Search master_partners by Global ID | Name, One ID |
| Distributor Name | Distributor ID | Search master_distributors by name | Distributor ID |
| Distributor ID | Distributor Name | Search master_distributors by ID | Name |

This means that older records created by earlier uploads also benefit as new master data comes in from later uploads. For example:

1. Upload a Microsoft Renewal list --> creates records with `partnerName = "All Net Inc"` but no Global ID
2. Upload a Partner Center file --> a master partner "All Net Inc" gets enriched with Global ID
3. Post-upload enrichment runs --> all existing subscription records with `partnerName = "All Net Inc"` now get the Global ID backfilled

---

## 5. Subscription Name Normalization

Different source files use different naming conventions for the same product. The system normalizes subscription names by stripping common prefixes (iteratively, in case they are stacked):

| Raw Name | Normalized |
|----------|-----------|
| O365 - M365 Business Basic | Business Basic |
| Microsoft 365 Business Basic | Business Basic |
| M365 Business Basic | Business Basic |
| Office 365 Business Premium | Business Premium |
| Business Standard | Business Standard |

This ensures that "O365 - M365 Business Basic" from a Microsoft Renewal matches "Microsoft 365 Business Basic" from a Partner Center export.

---

## Summary Flow

```
File uploaded
    |
    v
For each row:
    |
    +--> Process Distributor master table (find or create/enrich)
    +--> Process Partner master table (find or create/enrich)
    +--> Process Customer master table (find or create/enrich/flag)
    +--> Process Subscription (find by customer+subscription+partner --> create/enrich/flag)
    |
    v
All rows done
    |
    v
Post-upload enrichment
    (backfill missing TPID, Global ID, names from master tables
     across ALL records in the organization)
    |
    v
Job marked complete
```
