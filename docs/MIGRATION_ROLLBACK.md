# Database Migration Rollback Procedures

This document outlines the procedures for rolling back database migrations in the EONPRO healthcare
platform.

## Table of Contents

- [Overview](#overview)
- [Quick Reference](#quick-reference)
- [Rollback Scenarios](#rollback-scenarios)
- [Step-by-Step Procedures](#step-by-step-procedures)
- [Emergency Procedures](#emergency-procedures)
- [Best Practices](#best-practices)

## Overview

EONPRO uses Prisma for database migrations. All migrations should be **idempotent** (safe to run
multiple times) to minimize rollback complexity.

### Key Principles

1. **Prevention First**: Validate migrations in CI before production
2. **Idempotent Design**: All migrations use `IF NOT EXISTS` checks
3. **Minimal Risk**: Schema changes are additive when possible
4. **Data Preservation**: Avoid destructive operations in migrations

## Quick Reference

```bash
# Check migration status
npx prisma migrate status

# View failed migrations
npm run db:migrate:status

# Mark a migration as rolled back (removes from history)
npx prisma migrate resolve --rolled-back <migration_name>

# Mark a migration as applied (for manual fixes)
npx prisma migrate resolve --applied <migration_name>

# Validate migrations before deployment
npm run db:migrate:validate
```

## Rollback Scenarios

### Scenario 1: Migration Failed During Deployment

**Symptoms:**

- Deployment fails with migration error
- `prisma migrate status` shows failed migration

**Resolution:**

```bash
# 1. Check which migration failed
npx prisma migrate status

# 2. If migration is idempotent, mark as rolled-back and retry
npx prisma migrate resolve --rolled-back <migration_name>

# 3. Redeploy (migration will run again)
npm run vercel-build
```

### Scenario 2: Migration Succeeded But Caused Issues

**Symptoms:**

- Application errors after deployment
- Database queries failing on new schema

**Resolution:**

1. **Assess the impact** - Check Sentry/logs for errors
2. **Decide on approach:**
   - **Option A**: Fix forward (create new migration to fix)
   - **Option B**: Rollback (only if critical)

For Option B (manual rollback):

```sql
-- Connect to production database with READ/WRITE access
-- Execute the rollback SQL from the migration file
-- (Found in comments at bottom of each migration.sql)

-- Example:
ALTER TABLE "MyTable" DROP COLUMN IF EXISTS "newColumn";
```

### Scenario 3: Data Migration Corrupted Data

**Symptoms:**

- Data integrity issues
- Business logic failures

**Resolution:**

1. **Stop the bleeding** - Disable affected features if needed
2. **Assess data impact** - How many records affected?
3. **Restore from backup** (if critical) or **fix forward** (if minor)

## Step-by-Step Procedures

### Procedure A: Rolling Back a Schema Change

1. **Identify the migration**

   ```bash
   npx prisma migrate status
   ```

2. **Get the rollback SQL**
   - Open `prisma/migrations/<migration_name>/migration.sql`
   - Find the `ROLLBACK SQL` section at the bottom

3. **Execute rollback SQL**

   ```bash
   # Connect to database
   psql $DATABASE_URL

   # Execute rollback commands
   \i /path/to/rollback.sql
   ```

4. **Update Prisma migration history**

   ```bash
   npx prisma migrate resolve --rolled-back <migration_name>
   ```

5. **Verify**
   ```bash
   npx prisma migrate status
   ```

### Procedure B: Rolling Back a Data Migration

Data migrations are harder to rollback because they transform existing data.

1. **Check if backup exists** - Restore from database backup if critical

2. **For reversible changes:**
   - Create a new migration that reverses the data changes
   - Test thoroughly in staging first

3. **For irreversible changes:**
   - Restore from backup
   - OR manually fix affected records

### Procedure C: Emergency Full Rollback

**Use only when system is down and needs immediate recovery**

1. **Get the last known-good database backup**

   ```bash
   # List available backups (AWS RDS example)
   aws rds describe-db-snapshots --db-instance-identifier eonpro-prod
   ```

2. **Restore to a new instance**

   ```bash
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier eonpro-prod-recovery \
     --db-snapshot-identifier <snapshot-id>
   ```

3. **Update connection string** to point to recovery instance

4. **Roll back application code** to match database state

## Emergency Procedures

### Database is Down

1. Check AWS RDS console for instance status
2. If instance is healthy but DB is corrupted:
   - Restore from most recent backup
3. If instance is failing:
   - Failover to read replica (if configured)
   - Or restore from backup to new instance

### Production Data Corruption

1. **Isolate the issue** - Identify affected tables/records
2. **Stop writes** to affected tables (if possible)
3. **Assess options:**
   - Point-in-time recovery (best for recent corruption)
   - Restore from backup (for older issues)
   - Manual data fix (for small-scale issues)

## Best Practices

### Before Creating a Migration

1. **Plan the rollback** - Know how to undo before you deploy
2. **Make it idempotent** - Use `IF NOT EXISTS` everywhere
3. **Test in staging** - Always test migrations in staging first
4. **Small increments** - Prefer multiple small migrations over large ones

### During Deployment

1. **Monitor closely** - Watch for errors during deployment
2. **Have rollback ready** - Know what commands to run
3. **Off-peak deployments** - Deploy during low-traffic periods

### After Deployment

1. **Verify functionality** - Test critical paths
2. **Monitor metrics** - Watch error rates, latencies
3. **Keep backup accessible** - Don't delete backups immediately

## Migration Rollback Checklist

- [ ] Identified the problematic migration
- [ ] Reviewed the migration SQL and rollback SQL
- [ ] Tested rollback in staging/local
- [ ] Have database backup accessible
- [ ] Team notified of rollback
- [ ] Executed rollback SQL
- [ ] Updated Prisma migration history
- [ ] Verified application functionality
- [ ] Documented the incident

## Contact

For migration emergencies, contact:

- **On-call Engineer**: Check PagerDuty
- **Database Admin**: [Contact Info]
- **Platform Lead**: [Contact Info]
