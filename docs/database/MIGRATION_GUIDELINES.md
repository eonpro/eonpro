# Database Migration Guidelines

> **Enterprise-grade best practices for database schema changes**

This document outlines the procedures and best practices for managing database migrations in the EONPRO platform. Following these guidelines prevents production outages and ensures smooth schema evolution.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Migration Workflow](#migration-workflow)
- [Adding New Columns](#adding-new-columns)
- [Removing Columns](#removing-columns)
- [Renaming Columns](#renaming-columns)
- [Adding New Tables](#adding-new-tables)
- [Pre-deployment Checklist](#pre-deployment-checklist)
- [Emergency Rollback](#emergency-rollback)
- [Common Pitfalls](#common-pitfalls)

---

## Quick Reference

### Commands

```bash
# Development - Create new migration
npm run db:migrate:dev

# Production - Deploy migrations
npm run db:migrate

# Validate schema
npm run db:validate

# Check migration status
npx prisma migrate status
```

### Key Principles

1. **Migrations run BEFORE code deployment** (enforced in CI/CD)
2. **Always use DEFAULT values** for new required columns
3. **Use explicit `select` clauses** in all Prisma queries
4. **Update pre-deploy validation** when adding columns

---

## Migration Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SAFE MIGRATION WORKFLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Create Migration Locally                                     │
│     └─> npm run db:migrate:dev                                   │
│                                                                  │
│  2. Update Code to Use New Fields                                │
│     └─> Add select clauses, update repository                    │
│                                                                  │
│  3. Update Pre-deploy Checks                                     │
│     └─> scripts/pre-deploy-check.ts                              │
│                                                                  │
│  4. Commit & Push                                                │
│     └─> Migration + Code changes in same PR                      │
│                                                                  │
│  5. CI/CD Pipeline                                               │
│     ├─> Deploy to Staging                                        │
│     ├─> Run Migrations (BEFORE production deploy)                │
│     └─> Deploy to Production                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Adding New Columns

### Step 1: Add Column with DEFAULT Value

Always provide a default value to prevent migration failures:

```prisma
// schema.prisma
model Clinic {
  // ... existing fields
  
  // New field with default - SAFE
  buttonTextColor String @default("auto")
  
  // New nullable field - SAFE  
  newOptionalField String?
}
```

### Step 2: Create Migration

```bash
npm run db:migrate:dev -- --name add_button_text_color
```

### Step 3: Update Code with Explicit Selects

```typescript
// BAD - fetches all fields (breaks if new column doesn't exist)
const clinic = await prisma.clinic.findUnique({
  where: { id },
});

// GOOD - explicit fields (safe even if column doesn't exist)
const clinic = await prisma.clinic.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    buttonTextColor: true,  // Add new field explicitly
  },
});

// BEST - use repository pattern
import { clinicRepository } from '@/domains/clinic';
const clinic = await clinicRepository.findById(id);
```

### Step 4: Update Pre-deploy Validation

Add the new column to `scripts/pre-deploy-check.ts`:

```typescript
const criticalTables = {
  Clinic: [
    'id', 'name', 'subdomain',
    'buttonTextColor',  // Add new column here
  ],
};
```

### Step 5: Update Repository (if applicable)

Add the new field to the appropriate select pattern in `src/domains/clinic/repositories/clinic.repository.ts`:

```typescript
export const CLINIC_BRANDING_SELECT = {
  // ... existing fields
  buttonTextColor: true,  // Add here after migration is deployed
} satisfies Prisma.ClinicSelect;
```

---

## Removing Columns

Removing columns is a **multi-step process** to prevent breaking running code:

### Step 1: Remove from Code First

1. Remove all references to the column in application code
2. Update all `select` statements to exclude the column
3. Deploy code changes

### Step 2: Wait for All Instances to Update

- Wait for Vercel to rotate all serverless function instances
- Typically 5-10 minutes after deployment

### Step 3: Create Migration to Remove Column

```bash
npm run db:migrate:dev -- --name remove_deprecated_column
```

### Step 4: Deploy Migration

The next deployment will apply the column removal.

---

## Renaming Columns

Column renames require a **three-phase approach**:

### Phase 1: Add New Column

```prisma
model Clinic {
  oldColumnName String  // Keep existing
  newColumnName String? // Add new as nullable
}
```

### Phase 2: Dual-Write Migration

Deploy code that writes to both columns:

```typescript
await prisma.clinic.update({
  where: { id },
  data: {
    oldColumnName: value,
    newColumnName: value,  // Write to both
  },
});
```

### Phase 3: Data Migration

Run a script to copy existing data:

```typescript
await prisma.$executeRaw`
  UPDATE "Clinic" 
  SET "newColumnName" = "oldColumnName" 
  WHERE "newColumnName" IS NULL
`;
```

### Phase 4: Switch Reads to New Column

Update code to read from new column only.

### Phase 5: Remove Old Column

After verification, remove the old column.

---

## Adding New Tables

### Step 1: Define Model

```prisma
model NewFeature {
  id        Int      @id @default(autoincrement())
  clinicId  Int
  name      String
  createdAt DateTime @default(now())
  
  clinic    Clinic   @relation(fields: [clinicId], references: [id])
  
  @@index([clinicId])
}
```

### Step 2: Create Migration

```bash
npm run db:migrate:dev -- --name add_new_feature_table
```

### Step 3: Add to Pre-deploy Checks (Optional)

For critical tables, add to validation:

```typescript
const criticalTables = {
  NewFeature: ['id', 'clinicId', 'name'],
};
```

---

## Pre-deployment Checklist

Use this checklist for every migration PR:

### Required

- [ ] Migration has DEFAULT values for new required columns
- [ ] Pre-deploy validation updated (`scripts/pre-deploy-check.ts`)
- [ ] All queries use explicit `select` clauses
- [ ] Repository patterns updated if applicable

### Recommended

- [ ] Tested locally with `npm run db:migrate:dev`
- [ ] Migration status verified: `npx prisma migrate status`
- [ ] Rollback plan documented (see below)

### PR Template

```markdown
## Database Migration

### Changes
- Adding: `Clinic.buttonTextColor` (String, default: "auto")

### Checklist
- [x] DEFAULT value provided
- [x] Pre-deploy checks updated
- [x] Explicit selects in all affected queries
- [x] Repository updated

### Rollback Plan
If issues occur:
1. Revert PR commit
2. Migration is backwards-compatible (column has default)
3. No data migration needed for rollback
```

---

## Emergency Rollback

### If a Migration Causes Issues

1. **Don't panic** - assess the impact first

2. **Check logs**:
   ```bash
   # Vercel logs
   vercel logs --follow
   
   # Database status
   npx prisma migrate status
   ```

3. **For schema issues**:
   - The CI/CD pipeline deploys migrations before code
   - Rolling back code won't remove columns
   - Usually safe to keep new columns (they have defaults)

4. **For data corruption**:
   - Restore from backup immediately
   - Contact database administrator

5. **Create a fix-forward migration**:
   ```bash
   npm run db:migrate:dev -- --name fix_issue_description
   ```

---

## Common Pitfalls

### 1. Missing Default Values

```prisma
// ❌ BAD - will fail if existing rows exist
newColumn String

// ✅ GOOD - safe for existing data
newColumn String @default("default_value")
```

### 2. Querying Without Select

```typescript
// ❌ BAD - fetches ALL columns including new ones
const clinic = await prisma.clinic.findUnique({ where: { id } });

// ✅ GOOD - only fetches specified columns
const clinic = await prisma.clinic.findUnique({
  where: { id },
  select: { id: true, name: true },
});
```

### 3. Deploying Code Before Migrations

The CI/CD pipeline prevents this, but if manually deploying:

```bash
# ❌ WRONG ORDER
vercel deploy --prod  # Code expects new column
npx prisma migrate deploy  # Column added too late

# ✅ CORRECT ORDER  
npx prisma migrate deploy  # Column exists first
vercel deploy --prod  # Code can now use it
```

### 4. Forgetting Pre-deploy Checks

Always update `scripts/pre-deploy-check.ts` when adding critical columns:

```typescript
const criticalTables = {
  Clinic: [
    'id', 'name', 'subdomain',
    'newCriticalColumn',  // ADD NEW COLUMNS HERE
  ],
};
```

---

## Related Documentation

- [Architecture Overview](../ARCHITECTURE_ANALYSIS.md)
- [Environment Variables](../ENVIRONMENT_VARIABLES.md)
- [Disaster Recovery](../DISASTER_RECOVERY.md)
- [CI/CD Pipeline](../../.github/workflows/deploy.yml)

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-24 | System | Initial version after buttonTextColor incident |
