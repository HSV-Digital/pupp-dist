# Email Assets

Project B does not currently require a transactional email provider to run.

## What the email features do today

The app generates downloadable email-oriented assets and signed links, including:

- proposal options email documents
- opportunity list email documents
- customer proposal email documents
- partner-ready email documents

These are generated and downloaded through the API. The app does not currently send them through SMTP or a provider such as Resend.

## What this means for setup

There are no canonical email-delivery env vars in the current root `.env.example`.

You do not need to configure:

- SMTP credentials
- Resend API keys
- sender domains

to complete the standard deployment.

## Operational expectation

Partners are expected to:

- download the generated email asset, or
- integrate their own outbound sending process outside the current app setup

## Related settings

Email asset generation still depends on the normal application stack:

- auth
- database
- redis
- API public URL settings
- optional Blob Storage for blob-backed asset workflows
