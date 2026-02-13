# CI/CD and Pre-Deployment

## GitHub Actions workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **CI Pipeline** (`.github/workflows/ci.yml`) | Push/PR to main, develop, feature/** | Lint, type-check, format, security scan, migration validation, tests, build |
| **Pre-Deployment Database Check** (`.github/workflows/pre-deploy-check.yml`) | Push/PR to main, production | Database integrity + schema validation, then type-check and build |
| **Security Scan** (`.github/workflows/security-scan.yml`) | Push to main, schedule, dispatch | Dependency audit, SAST, secret detection, container scan, license check |

## Required GitHub Secrets

### Pre-Deployment workflow (must pass before deploy)

The **Pre-Deployment Database Check** runs `npm run pre-deploy`, which needs a live database. Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Production (or staging) PostgreSQL connection string used for queries. Use the same URL your app uses (e.g. pooled/PgBouncer if applicable). |
| `DIRECT_DATABASE_URL` | Direct PostgreSQL connection (e.g. port 5432) used for migrations. Required if you use a pooled URL for `DATABASE_URL`. |

- **If these secrets are missing**, the "Database & Schema Validation" job fails and "Build Verification" never runs. Add them so pre-deploy can connect and validate schema/data before build.
- For **forks or repos without production DB access**, you can disable the pre-deploy workflow for that repo or use a read-only/staging URL that reflects production schema.

### Other optional secrets

| Secret | Used by |
|--------|--------|
| `SNYK_TOKEN` | CI security job (Snyk scan); optional, job continues if not set. |
| `CODECOV_TOKEN` | CI test job (coverage upload); optional. |

## Fixing common CI failures

- **Lint & Type Check:** Run `npm run format:check` and `npm run format` if needed; fix ESLint/TypeScript as required.
- **Validate Migrations:** Ensure `npx prisma migrate deploy` runs against Postgres 14 (e.g. in CI with the service container). Check the Actions log for the failing migration and error message.
- **Pre-Deploy Build Verification:** Ensure `DATABASE_URL` and `DIRECT_DATABASE_URL` are set (see above). Build uses `SKIP_ENV_VALIDATION` and placeholder JWT for build-only.
- **Container Security Scan:** Docker build must succeed (Next.js `output: 'standalone'` in `next.config.js`). Fix any CRITICAL/HIGH CVEs reported by Trivy in the base image or dependencies.
- **Security Scan (TruffleHog/Semgrep):** Remove or rotate any verified secrets; fix SAST findings reported in the log.

## Local pre-deploy check

Before pushing to main/production, run:

```bash
export DATABASE_URL="postgresql://..." DIRECT_DATABASE_URL="postgresql://..."
npm run pre-deploy
npm run build
```

See `scripts/pre-deploy-check.ts` for what is validated.
