# @pretoscop/db

Drizzle schema, migrations, partition and rollup SQL, seed and typed queries.

Contract (filled in M01):
- `createPool(url, max)` / `createDb(pool)` → typed Drizzle client.
- Table and column names follow `docs/03-architecture.md` §5.
- Database changes only through migrations in `packages/db/migrations`.
