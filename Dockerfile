# Multi-stage build producing Next.js's "standalone" output (execution-plan
# §75: Docker Compose for local dev). The same image serves both the
# `web` and `worker` services in docker-compose.yml — see CMD overrides
# there — since both need the same code and dependencies, just a
# different entrypoint (§3/§31: the worker must be a separate PROCESS,
# not necessarily a separate image).
#
# This image targets PostgreSQL specifically (docker-compose.yml's whole
# point is demonstrating that path — plain `npm run dev` already covers
# SQLite with zero setup, see README). The committed schema.prisma
# defaults to `provider = "sqlite"` for that no-setup local dev path, so
# it's patched to "postgresql" at build time here; see
# docker-entrypoint.sh for why the database is synced with `db push`
# rather than the committed (SQLite-flavored) migration files.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
# Build-time env vars are dummy values — Next.js needs *something* present
# to compile pages that read them; the real values are supplied at
# container runtime via docker-compose's environment.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
    SESSION_SECRET="build-time-placeholder" \
    NEXT_PUBLIC_APP_URL="http://localhost:3000"
RUN npm run db:generate
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system nodejs && useradd --system --gid nodejs nextjs

# Standalone server + static assets — not the full node_modules tree.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# The worker process (npm run worker) and `prisma db push` need the
# original source + full node_modules + Prisma engine + the
# Postgres-patched schema, none of which the standalone output includes
# — kept alongside for that entrypoint.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
