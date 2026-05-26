# Commit: Update URLs and terminology for CSP partners

**Hash:** `2f315d10761ca8517d1b5944387ad374d3f40258`
**Author:** mhtydv93
**Date:** Thu Apr 16 17:57:05 2026 +0530
**Message:** Update URLs and terminology for CSP partners across the application, including redirects, environment variables, and proposal components, to enhance clarity and consistency.

**Stats:** 38 files changed, 454 insertions, 428 deletions

---

## Summary of Changes

This commit performs a large-scale rename of **"resellers" to "csp-partners"** across the entire application (routes, URLs, env vars, labels, docs). It also includes code formatting cleanups (Prettier-style reformats), removal of unused SVG icon constants from PDF templates, and a minor input `step` change from `0.01` to `1` in ScenarioCard price inputs.

---

## 1. File Renames (Directory Move)

The entire `apps/web/src/app/resellers/` directory was moved to `apps/web/src/app/csp-partners/`:

```
apps/web/src/app/resellers/(protected)/ResellerShell.tsx       -> apps/web/src/app/csp-partners/(protected)/ResellerShell.tsx
apps/web/src/app/resellers/(protected)/dashboard/page.tsx      -> apps/web/src/app/csp-partners/(protected)/dashboard/page.tsx
apps/web/src/app/resellers/(protected)/layout.tsx              -> apps/web/src/app/csp-partners/(protected)/layout.tsx
apps/web/src/app/resellers/(protected)/proposal/[customerId]/assets/page.tsx -> apps/web/src/app/csp-partners/(protected)/proposal/[customerId]/assets/page.tsx
apps/web/src/app/resellers/(protected)/proposal/[customerId]/page.tsx        -> apps/web/src/app/csp-partners/(protected)/proposal/[customerId]/page.tsx
apps/web/src/app/resellers/ResellersHero.tsx                   -> apps/web/src/app/csp-partners/ResellersHero.tsx
apps/web/src/app/resellers/guest/proposal/[customerId]/assets/page.tsx -> apps/web/src/app/csp-partners/guest/proposal/[customerId]/assets/page.tsx
apps/web/src/app/resellers/guest/proposal/[customerId]/page.tsx        -> apps/web/src/app/csp-partners/guest/proposal/[customerId]/page.tsx
apps/web/src/app/resellers/page.tsx                            -> apps/web/src/app/csp-partners/page.tsx
```

---

## 2. Environment Variables

### `.env.example` and `apps/api/.env.example`

```diff
-PARTNER_UPLOAD_URL="http://localhost:3000/resellers"
+PARTNER_UPLOAD_URL="http://localhost:3000/csp-partners"
```

### `apps/api/src/config/env.ts`

```diff
 partnerUploadUrl: readStringEnv(
   'PARTNER_UPLOAD_URL',
-  `${frontendUrl.replace(/\/+$/u, '')}/resellers`,
+  `${frontendUrl.replace(/\/+$/u, '')}/csp-partners`,
 ),
```

---

## 3. Next.js Redirects (NEW)

### `apps/web/next.config.ts`

Added redirect rules so old `/resellers` URLs forward to `/csp-partners`:

```typescript
async redirects() {
  return [
    {
      source: '/resellers',
      destination: '/csp-partners',
      permanent: true,
    },
    {
      source: '/resellers/:path*',
      destination: '/csp-partners/:path*',
      permanent: true,
    },
  ];
},
```

---

## 4. Route String Replacements (All `/resellers` -> `/csp-partners`)

### `apps/web/src/app/(protected)/layout.tsx`

```diff
-redirect('/resellers');
+redirect('/csp-partners');
```

### `apps/web/src/app/PostHogProvider.tsx`

```diff
-pathname.startsWith('/resellers/')
+pathname.startsWith('/csp-partners/')
```

### `apps/web/src/app/api/reseller/auth/start/route.ts`

```diff
-const redirectTo = resolveRedirectTo(request, '/resellers/dashboard');
+const redirectTo = resolveRedirectTo(request, '/csp-partners/dashboard');
```

### `apps/web/src/app/csp-partners/(protected)/dashboard/page.tsx` (formerly resellers)

```diff
-`/resellers/proposal/${encodeResellerCustomerRouteKey(entry.customerId)}?from=resellers-dashboard`,
+`/csp-partners/proposal/${encodeResellerCustomerRouteKey(entry.customerId)}?from=resellers-dashboard`,
```

### `apps/web/src/app/csp-partners/(protected)/layout.tsx`

```diff
-redirect('/resellers');
+redirect('/csp-partners');
```

### `apps/web/src/app/csp-partners/(protected)/proposal/[customerId]/assets/page.tsx`

```diff
-router.replace('/resellers/dashboard');
+router.replace('/csp-partners/dashboard');

-const proposalBasePath = `/resellers/proposal/${encodeResellerCustomerRouteKey(customerId)}`;
+const proposalBasePath = `/csp-partners/proposal/${encodeResellerCustomerRouteKey(customerId)}`;
```

### `apps/web/src/app/csp-partners/(protected)/proposal/[customerId]/page.tsx`

```diff
-router.replace('/resellers/dashboard');
+router.replace('/csp-partners/dashboard');

-? '/resellers/dashboard'
+? '/csp-partners/dashboard'

-: '/resellers/dashboard';
+: '/csp-partners/dashboard';

-assetsBasePath={`/resellers/proposal/${...}/assets`}
+assetsBasePath={`/csp-partners/proposal/${...}/assets`}
```

### `apps/web/src/app/csp-partners/ResellersHero.tsx`

```diff
-router.push(`/resellers/guest/proposal/${customerId}`);
+router.push(`/csp-partners/guest/proposal/${customerId}`);
```

### `apps/web/src/app/csp-partners/guest/proposal/[customerId]/assets/page.tsx`

```diff
-const proposalBasePath = `/resellers/guest/proposal/${customerId}`;
+const proposalBasePath = `/csp-partners/guest/proposal/${customerId}`;
```

### `apps/web/src/app/csp-partners/guest/proposal/[customerId]/page.tsx`

```diff
-backHref="/resellers"
+backHref="/csp-partners"

-assetsBasePath={`/resellers/guest/proposal/${customerId}/assets`}
+assetsBasePath={`/csp-partners/guest/proposal/${customerId}/assets`}
```

### `apps/web/src/app/csp-partners/page.tsx`

```diff
-redirect('/resellers/dashboard');
+redirect('/csp-partners/dashboard');
```

### `apps/web/src/app/demo/layout.tsx`

```diff
-redirect('/resellers');
+redirect('/csp-partners');
```

### `apps/web/src/app/page.tsx`

```diff
-redirect('/resellers');
+redirect('/csp-partners');
```

### `apps/web/src/app/reseller/page.tsx`

```diff
-permanentRedirect('/resellers');
+permanentRedirect('/csp-partners');
```

### `apps/web/src/components/resellers/ResellerLoginForm.tsx`

```diff
-callbackUrl: '/resellers/dashboard',
+callbackUrl: '/csp-partners/dashboard',

-router.push('/resellers/dashboard');
+router.push('/csp-partners/dashboard');
```

### `apps/web/src/components/resellers/ResellerNavbar.tsx`

```diff
-href="/resellers/dashboard"
+href="/csp-partners/dashboard"

-Resellers
+CSP Partners
```

### `apps/web/src/lib/reseller-auth-context.tsx`

```diff
-await signOut({ callbackUrl: '/resellers' });
+await signOut({ callbackUrl: '/csp-partners' });
```

### `apps/web/src/lib/reseller-auth.ts`

Multiple replacements:

```diff
-pathname.startsWith('/resellers/')
+pathname.startsWith('/csp-partners/')

-return NextResponse.redirect(new URL('/resellers', request.nextUrl));
+return NextResponse.redirect(new URL('/csp-partners', request.nextUrl));

-return '/resellers?error=no_mpn_access';    (4 occurrences)
+return '/csp-partners?error=no_mpn_access';

-return '/resellers?error=generic_email';
+return '/csp-partners?error=generic_email';

-signIn: '/resellers',
-error: '/resellers',
+signIn: '/csp-partners',
+error: '/csp-partners',
```

---

## 5. Label / Terminology Changes

### `apps/web/src/components/admin-analytics/admin-analytics-activity-download-grid.tsx`

```diff
-title: 'Reseller lists downloaded',
-entityLabel: 'Resellers included',
+title: 'CSP Partner lists downloaded',
+entityLabel: 'CSP Partners included',
```

### `apps/api/src/pdf/pdf-chunk.service.ts`

```diff
-{ label: 'Resellers', value: this.formatNumber(documentRows.length) },
+{ label: 'CSP Partners', value: this.formatNumber(documentRows.length) },
```

### `apps/api/src/pdf/pdf.service.ts` (2 occurrences)

```diff
-{ label: 'Resellers', value: formatNumber(sampleRows.length) },
+{ label: 'CSP Partners', value: formatNumber(sampleRows.length) },

-{ label: 'Resellers', value: formatNumber(documentRows.length) },
+{ label: 'CSP Partners', value: formatNumber(documentRows.length) },
```

### `apps/web/src/lib/theme-config.ts` (comment)

```diff
-/** Reseller dashboard page (/resellers/dashboard) */
+/** Reseller dashboard page (/csp-partners/dashboard) */
```

---

## 6. Test File Updates

### `apps/api/src/blob-storage/blob-storage.service.spec.ts`

```diff
-partnerUploadUrl: 'https://example.com/resellers',
+partnerUploadUrl: 'https://example.com/csp-partners',
```

### `apps/api/src/email/proposal-options-email.service.spec.ts`

All `url` values and assertions changed:

```diff
-url: 'https://pupp.cloud-programs.com/resellers',
+url: 'https://pupp.cloud-programs.com/csp-partners',

-'https://pupp.cloud-programs.com/resellers',
+'https://pupp.cloud-programs.com/csp-partners',

-'Target="https://pupp.cloud-programs.com/resellers"',
+'Target="https://pupp.cloud-programs.com/csp-partners"',
```

(~13 occurrences across the file)

### `apps/api/src/pdf/dl-token.service.spec.ts`

```diff
-url: 'https://pupp.cloud-programs.com/resellers',
+url: 'https://pupp.cloud-programs.com/csp-partners',
```

### `apps/web/src/components/proposal/ProposalPageContent.test.tsx`

```diff
-backHref="/reseller"
+backHref="/csp-partners"

-expect(pushMock).toHaveBeenCalledWith('/reseller');
+expect(pushMock).toHaveBeenCalledWith('/csp-partners');
```

---

## 7. PDF Template Cleanup (Removed Unused Code)

### `apps/api/src/pdf/pdf-html-templates.ts`

Removed ~80 lines of unused SVG icon constants and related code:

- Removed: `ICON_RESELLERS`, `ICON_CUSTOMERS`, `ICON_OPPORTUNITIES`, `ICON_SEATS`, `ICON_EXPIRING_ARR`
- Removed: `SUMMARY_ICONS` record
- Removed: `formatNumber()` helper function
- Removed: `SummaryLayout` type
- Removed: `renderSummary()` function (both `panel-5` and `cards-4` layouts)

### `apps/api/src/pdf/pdf.service.ts`

Removed unused helper functions:

```diff
-function formatCurrency(value: number): string {
-  return `$${Math.round(value).toLocaleString('en-US')}`;
-}
-
-function formatCurrencyAbbreviated(value: number): string {
-  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
-  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
-  return `$${Math.round(value).toLocaleString('en-US')}`;
-}
```

---

## 8. ScenarioCard Input Step Change

### `apps/web/src/components/proposal/ScenarioCard.tsx`

Changed numeric input `step` from `0.01` to `1` for all four price inputs (current SKU reseller, current SKU customer, target SKU reseller, target SKU customer):

```diff
-step={0.01}
+step={1}
```

---

## 9. Code Formatting (Prettier)

The following files had whitespace/formatting changes only (line wrapping, indentation alignment):

- `apps/web/next-env.d.ts` (quote style change)
- `apps/api/src/pdf/pdf-html-templates.ts` (reformatted month array, ternary operators, function arguments)
- `apps/web/src/components/proposal/ScenarioCard.tsx` (reformatted JSX to multi-line, fixed indentation)
- `scripts/setup.ts` (reformatted long strings)
- `docs/claude_code_plan.md` (markdown table alignment, added blank lines before lists)
- `docs/dedup-and-enrichment-rules.md` (markdown table alignment)

---

## 10. Documentation Updates

### `docs/TECHNICAL_OVERVIEW.md`

```diff
-### Resellers
+### CSP Partners
```

### `docs/claude_code_plan.md`

```diff
-Resellers upload Excel or CSV files containing renewal and CLAS data.
+CSP Partners upload Excel or CSV files containing renewal and CLAS data.
```

Plus markdown formatting alignment throughout.

### `docs/dedup-and-enrichment-rules.md`

```diff
-### Example: Two Different Resellers
+### Example: Two Different CSP Partners
```

Plus markdown table alignment throughout.
