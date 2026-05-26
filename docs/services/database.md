# Database

Project B requires PostgreSQL.

## Canonical config

Primary setting:

- `DATABASE_URL`

Fallback settings supported by the API if `DATABASE_URL` is blank:

- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`

`DATABASE_URL` is the recommended and documented path for partner deployments.

## Local Docker default

When using:

```bash
docker compose --profile local up -d
```

the bundled PostgreSQL service uses:

```bash
postgresql://postgres:postgres@postgres:5432/projectb
```

Related env defaults:

- `POSTGRES_USER=postgres`
- `POSTGRES_PASSWORD=postgres`
- `POSTGRES_DB=projectb`

## Managed PostgreSQL

Any standard PostgreSQL provider can work if it is reachable from the API runtime.

Typical checklist:

1. create a PostgreSQL 16 database
2. create a database user with the required privileges
3. allow network access from the API runtime
4. set `DATABASE_URL`

Example:

```bash
DATABASE_URL="postgresql://dbuser:dbpass@db.example.com:5432/projectb"
```

## Azure Database for PostgreSQL

For Azure Flexible Server:

1. create the server and database
2. allow the API runtime or App Service network to connect
3. use `sslmode=require`

Example:

```bash
DATABASE_URL="postgresql://dbuser:dbpass@server.postgres.database.azure.com:5432/projectb?sslmode=require"
```

## Migrations

The API production container runs migrations automatically on startup.

If you run the API directly outside Docker, run:

```bash
npm run db:migrate --workspace api
```

## Common pitfalls

- missing `sslmode=require` on Azure
- firewall rules blocking the API runtime
- using a database name other than the one in `DATABASE_URL`
- filling `POSTGRES_*` values but forgetting that a managed deployment still needs `DATABASE_URL`
