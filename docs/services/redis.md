# Redis

Project B requires Redis for queueing and cache-backed workflows.

## Canonical config

Primary setting:

- `REDIS_URL`

Compatibility fallbacks remain supported:

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_DB`

`REDIS_URL` is the recommended and documented setting.

## Local Docker default

When using the `local` profile, the bundled Redis service uses:

```bash
REDIS_URL="redis://:redis@redis:6379/0"
```

## Managed Redis

Any provider that exposes a standard Redis connection URL can work.

Examples:

```bash
REDIS_URL="redis://:password@redis.example.com:6379/0"
REDIS_URL="rediss://:password@redis.example.com:6380/0"
```

Use `rediss://` when your provider requires TLS.

## Azure Cache for Redis

Azure commonly uses:

- TLS-enabled connections
- port `6380`
- a primary access key as the password

Example:

```bash
REDIS_URL="rediss://:primarykey@cache-name.redis.cache.windows.net:6380/0"
```

## Common pitfalls

- using `redis://` when the provider requires TLS
- forgetting to expose the Redis service to the API runtime
- mismatching the password between `REDIS_URL` and the actual cache
