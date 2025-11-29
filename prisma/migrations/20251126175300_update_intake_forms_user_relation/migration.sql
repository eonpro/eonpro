-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IntakeFormTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "treatmentType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "providerId" INTEGER,
    "createdById" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    CONSTRAINT "IntakeFormTemplate_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IntakeFormTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IntakeFormTemplate" ("createdAt", "description", "id", "isActive", "metadata", "name", "providerId", "treatmentType", "updatedAt", "version") SELECT "createdAt", "description", "id", "isActive", "metadata", "name", "providerId", "treatmentType", "updatedAt", "version" FROM "IntakeFormTemplate";
DROP TABLE "IntakeFormTemplate";
ALTER TABLE "new_IntakeFormTemplate" RENAME TO "IntakeFormTemplate";
CREATE INDEX "IntakeFormTemplate_treatmentType_isActive_idx" ON "IntakeFormTemplate"("treatmentType", "isActive");
CREATE INDEX "IntakeFormTemplate_providerId_idx" ON "IntakeFormTemplate"("providerId");
CREATE INDEX "IntakeFormTemplate_createdById_idx" ON "IntakeFormTemplate"("createdById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
