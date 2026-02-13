# Deployment and Rollback Runbook

**Purpose:** Standard steps to deploy safely and roll back when needed.  
**See also:** `docs/CI_AND_PRE_DEPLOY.md`, `docs/MIGRATION_ROLLBACK.md`, `docs/DISASTER_RECOVERY.md`.

---

## Pre-deploy checklist

1. **CI green:** Type-check, lint, and tests pass. `npm run type-check`, `npm run lint`, `npm run test` (or `test:coverage`).
2. **Migrations:** Validated locally or in CI. `npm run db:migrate:validate` (or `npm run pre-deploy` with DB secrets).
3. **Env:** Required production env vars set in target environment (see `docs/ENVIRONMENT_VARIABLES.md`, `docs/PRODUCTION_ENV_TEMPLATE.md`). No secrets in client-exposed vars.
4. **Startup validation:** In production, schema validation runs at server start (`src/instrumentation.ts`). To allow deploy despite schema issues, set `ALLOW_SCHEMA_ERRORS=true` only if explicitly needed; prefer fixing schema instead.

---

## Deploy (Vercel)

1. Push to the branch that triggers production deploy (e.g. `main`).
2. Vercel runs `vercel-build`: `db:migrate:safe` then `build`. Migrations run before build.
3. Confirm deploy in Vercel dashboard; check deployment logs for migration and build success.
4. Smoke-check: `GET /api/health` returns 200 and expected `database` status.

---

## Deploy (Docker / self-hosted)

1. Build image: `docker build -t eonpro:latest .` (or use `Dockerfile.production`).
2. Run DB migrations against the target DB:  
   `npm run db:migrate` (or `prisma migrate deploy`) with `DATABASE_URL` for that environment.
3. Start container with env file:  
   `docker run -p 3000:3000 --env-file .env eonpro:latest`.
4. Smoke-check: `GET /api/health` and, if used, `GET /api/monitoring/ready`.

---

## Rollback (application only)

When the new release is broken but the database is unchanged:

1. **Vercel:** In dashboard, open the previous deployment and use **Promote to Production** (or redeploy the last known-good commit).
2. **Docker:** Redeploy the previous image tag and restart containers.
3. Verify: `GET /api/health` and critical user flows.
4. No DB rollback needed if no new migrations were applied.

---

## Rollback (application + database)

When a migration or a release that depends on it must be reverted:

1. **Application:** Roll back to the previous release (see above).
2. **Migrations:** Follow `docs/MIGRATION_ROLLBACK.md`:
   - `npx prisma migrate status` to see applied migrations.
   - Resolve failed or unwanted migrations (e.g. `prisma migrate resolve --rolled-back <name>`).
   - Only run destructive or down-migrations if they exist and are documented; prefer forward fixes when possible.
3. Verify app and DB: health endpoint and a quick data check.

---

## Failure isolation

- **Health:** `GET /api/health` (basic) and `GET /api/health?full=true` (auth required, full checks). Use for load balancer or orchestrator health checks.
- **Readiness:** `GET /api/monitoring/ready` for dependency readiness (DB, optional services).
- **Feature flags / env:** Disable problematic features via env (e.g. disable a integration) to reduce impact while fixing.
- **Incidents:** See `docs/policies/POL-003-INCIDENT-RESPONSE.md` and `docs/DISASTER_RECOVERY.md` for escalation and recovery.

---

## Quick reference

| Action              | Command or step                                      |
|---------------------|------------------------------------------------------|
| Pre-deploy (local)  | `npm run pre-deploy` then `npm run build`           |
| Migration status   | `npx prisma migrate status`                          |
| Safe migrate        | `npm run db:migrate:safe`                            |
| Health check        | `GET /api/health`                                    |
| Rollback (Vercel)   | Promote previous deployment to production           |
| Rollback (DB)       | See `docs/MIGRATION_ROLLBACK.md`                     |
