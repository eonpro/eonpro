-- ============================================================================
-- Migration: [MIGRATION_NAME]
-- Author: [AUTHOR]
-- Date: [DATE]
-- Ticket: [TICKET_URL]
-- Description: [DESCRIPTION]
-- 
-- Idempotent: YES - This migration is safe to run multiple times
-- Dependencies: [LIST_ANY_DEPENDENT_MIGRATIONS]
-- ============================================================================

-- ============================================================================
-- SECTION 1: ENUM TYPES
-- Use DO blocks to check existence before creating
-- ============================================================================

-- Example: Create enum type (idempotent)
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MyEnumType') THEN
--         CREATE TYPE "MyEnumType" AS ENUM ('VALUE1', 'VALUE2', 'VALUE3');
--         RAISE NOTICE 'Created enum type MyEnumType';
--     ELSE
--         RAISE NOTICE 'Enum type MyEnumType already exists, skipping';
--     END IF;
-- END
-- $$;

-- ============================================================================
-- SECTION 2: TABLE CREATION
-- Use CREATE TABLE IF NOT EXISTS
-- ============================================================================

-- Example: Create table (idempotent)
-- CREATE TABLE IF NOT EXISTS "MyTable" (
--     "id" SERIAL PRIMARY KEY,
--     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     "updatedAt" TIMESTAMP(3) NOT NULL,
--     "name" VARCHAR(255) NOT NULL,
--     "status" "MyEnumType" NOT NULL DEFAULT 'VALUE1'
-- );

-- ============================================================================
-- SECTION 3: COLUMN ADDITIONS
-- Use DO blocks to check column existence
-- ============================================================================

-- Example: Add column (idempotent)
-- DO $$
-- BEGIN
--     IF NOT EXISTS (
--         SELECT 1 FROM information_schema.columns 
--         WHERE table_name = 'MyTable' AND column_name = 'newColumn'
--     ) THEN
--         ALTER TABLE "MyTable" ADD COLUMN "newColumn" TEXT;
--         RAISE NOTICE 'Added column newColumn to MyTable';
--     ELSE
--         RAISE NOTICE 'Column newColumn already exists, skipping';
--     END IF;
-- END
-- $$;

-- ============================================================================
-- SECTION 4: INDEX CREATION
-- Use CREATE INDEX IF NOT EXISTS
-- ============================================================================

-- Example: Create index (idempotent)
-- CREATE INDEX IF NOT EXISTS "MyTable_name_idx" ON "MyTable"("name");
-- CREATE INDEX IF NOT EXISTS "MyTable_status_createdAt_idx" ON "MyTable"("status", "createdAt" DESC);

-- ============================================================================
-- SECTION 5: FOREIGN KEY CONSTRAINTS
-- Use DO blocks to check constraint existence
-- ============================================================================

-- Example: Add foreign key (idempotent)
-- DO $$
-- BEGIN
--     IF NOT EXISTS (
--         SELECT 1 FROM information_schema.table_constraints 
--         WHERE constraint_name = 'MyTable_userId_fkey'
--     ) THEN
--         ALTER TABLE "MyTable" 
--         ADD CONSTRAINT "MyTable_userId_fkey" 
--         FOREIGN KEY ("userId") REFERENCES "User"("id") 
--         ON DELETE CASCADE ON UPDATE CASCADE;
--         RAISE NOTICE 'Added foreign key MyTable_userId_fkey';
--     ELSE
--         RAISE NOTICE 'Foreign key MyTable_userId_fkey already exists, skipping';
--     END IF;
-- END
-- $$;

-- ============================================================================
-- SECTION 6: DATA MIGRATIONS
-- Use UPDATE with WHERE conditions to be idempotent
-- ============================================================================

-- Example: Update data (idempotent - only updates where condition not met)
-- UPDATE "MyTable"
-- SET "newColumn" = 'default_value'
-- WHERE "newColumn" IS NULL;

-- ============================================================================
-- SECTION 7: CLEANUP (if needed)
-- ============================================================================

-- Example: Drop deprecated column (use with caution!)
-- ALTER TABLE "MyTable" DROP COLUMN IF EXISTS "deprecatedColumn";

-- ============================================================================
-- ROLLBACK SQL (for reference - copy this to execute manually if needed)
-- ============================================================================

-- DROP INDEX IF EXISTS "MyTable_name_idx";
-- DROP INDEX IF EXISTS "MyTable_status_createdAt_idx";
-- ALTER TABLE "MyTable" DROP CONSTRAINT IF EXISTS "MyTable_userId_fkey";
-- ALTER TABLE "MyTable" DROP COLUMN IF EXISTS "newColumn";
-- DROP TABLE IF EXISTS "MyTable";
-- DROP TYPE IF EXISTS "MyEnumType";

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
