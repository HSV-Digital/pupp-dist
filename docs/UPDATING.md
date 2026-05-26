# Updating

## Recommended flow

1. Pull the latest licensed source release.
2. Review `.env.example` for new or changed variables.
3. Rebuild the workspace:

```bash
npm install
npm run build
```

4. Re-run database migrations if the release notes require it:

```bash
npm run db:migrate --workspace api
```

5. Restart your containers or services.

## Local modifications

Keep deployment-specific changes in environment variables or infrastructure configuration wherever possible. Avoid editing application source directly unless you intend to maintain a fork.
