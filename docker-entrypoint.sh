#!/bin/sh
# Runs before both the `web` and `worker` containers start (see
# docker-compose.yml). Prisma's committed migration files under
# prisma/migrations/ were generated against the SQLite schema used for
# plain `npm run dev` — their SQL (PRAGMA statements, SQLite-specific
# syntax) does not apply to Postgres. `db push` instead syncs the
# database directly from the (already Postgres-patched, see Dockerfile)
# schema, sidestepping that mismatch for this Docker-only path.
set -e
npx prisma db push --skip-generate --accept-data-loss
exec "$@"
