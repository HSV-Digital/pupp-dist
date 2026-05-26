# Authentication

Project B uses NextAuth-based browser auth in the web app and token validation in the API.

## Current auth providers

- Internal Microsoft Entra ID
- Reseller Microsoft Entra ID
- Reseller Google OAuth

## Required env vars

Always required for auth sessions:

- `AUTH_SECRET`
- `NEXTAUTH_SECRET` as a compatibility alias

Provider-specific:

- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `AZURE_AD_RESELLER_CLIENT_ID`
- `AZURE_AD_RESELLER_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Optional tenant controls:

- `ALLOWED_TENANT_IDS`
- `DEFAULT_TENANT_ID`
- `MICROSOFT_TENANT_ID`
- `HSV_DIGITAL_TENANT_ID`
- `NEXT_PUBLIC_HSV_DIGITAL_TENANT_ID`

## Redirect URIs

Use your public web origin, not the API origin.

| Flow | Redirect URI |
| --- | --- |
| Internal Microsoft Entra | `https://your-web-origin/api/auth/callback/azure-ad` |
| Reseller Microsoft Entra | `https://your-web-origin/api/reseller/auth/callback/azure-ad` |
| Reseller Google | `https://your-web-origin/api/reseller/auth/callback/google` |

Local development equivalents:

- `http://localhost:3000/api/auth/callback/azure-ad`
- `http://localhost:3000/api/reseller/auth/callback/azure-ad`
- `http://localhost:3000/api/reseller/auth/callback/google`

## Internal Microsoft Entra setup

1. In Azure Portal, create or select an App Registration.
2. Choose the supported account type that matches your user model.
3. Add the internal callback URI:
   `https://your-web-origin/api/auth/callback/azure-ad`
4. Create a client secret.
5. Copy:
   - Application client ID into `AZURE_AD_CLIENT_ID`
   - Client secret into `AZURE_AD_CLIENT_SECRET`

Use single-tenant if only one Microsoft tenant should sign in. Use multi-tenant if you explicitly want cross-tenant sign-in.

## Reseller Microsoft Entra setup

Create a separate App Registration for reseller sign-in unless you intentionally want to reuse the same Entra app.

1. Add the reseller callback URI:
   `https://your-web-origin/api/reseller/auth/callback/azure-ad`
2. Create a client secret.
3. Copy:
   - Application client ID into `AZURE_AD_RESELLER_CLIENT_ID`
   - Client secret into `AZURE_AD_RESELLER_CLIENT_SECRET`

## Reseller Google setup

1. Create or select a Google Cloud project.
2. Configure the OAuth consent screen.
3. Create a Web Application OAuth client.
4. Add the authorized redirect URI:
   `https://your-web-origin/api/reseller/auth/callback/google`
5. Add `http://localhost:3000/api/reseller/auth/callback/google` for local development if needed.
6. Copy:
   - Client ID into `GOOGLE_CLIENT_ID`
   - Client secret into `GOOGLE_CLIENT_SECRET`

## URL alignment

The auth setup depends on these matching the real deployment:

- `NEXT_PUBLIC_APP_URL`
- `FRONTEND_URL`

In normal deployments, those two values should be the same public web origin.

## Common pitfalls

- redirect URI mismatch because of `http` vs `https`
- redirect URI mismatch because of a trailing slash
- configuring the API origin instead of the web origin
- forgetting to add the localhost callback for local development
- leaving `AUTH_SECRET` blank when running without the setup wizard
