# Analytics

Project B integrates with PostHog. Analytics are optional.

## Client-side analytics

Client capture is enabled when these are set:

- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`

If `NEXT_PUBLIC_POSTHOG_KEY` is blank, browser analytics stay disabled.

## Server-side analytics

Server event capture is enabled when these are set:

- `POSTHOG_PROJECT_TOKEN`
- `POSTHOG_CAPTURE_HOST`

If `POSTHOG_PROJECT_TOKEN` is blank, server event capture stays disabled.

## Admin analytics and advanced querying

Some admin analytics flows rely on PostHog API access rather than only event capture.

These advanced settings may be required depending on which analytics surfaces you use:

- `POSTHOG_ENDPOINT_API_KEY`
- `POSTHOG_PERSONAL_API_KEY`
- `POSTHOG_WEB_PROJECT_ID`
- `POSTHOG_QUERY_HOST`

If those values are blank, PostHog-backed admin analytics queries can fail even though the rest of the app continues to run.

## Recommended minimum setup

For basic product analytics:

- set `NEXT_PUBLIC_POSTHOG_KEY`
- set `NEXT_PUBLIC_POSTHOG_HOST`
- set `POSTHOG_PROJECT_TOKEN`
- set `POSTHOG_CAPTURE_HOST`

The setup wizard can cover this basic PostHog setup.

For deeper admin analytics:

- also set `POSTHOG_ENDPOINT_API_KEY`
- `POSTHOG_PERSONAL_API_KEY`
- `POSTHOG_WEB_PROJECT_ID`
- `POSTHOG_QUERY_HOST`

These advanced values are typically added manually after the wizard runs.

## Typical hosts

- US cloud: `https://us.i.posthog.com`
- query host: `https://us.posthog.com`

Use your PostHog region-specific hosts if your project is not in the US region.
