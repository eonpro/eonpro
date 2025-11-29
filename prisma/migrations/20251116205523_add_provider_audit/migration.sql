-- CreateTable
CREATE TABLE "ProviderAudit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerId" INTEGER NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    CONSTRAINT "ProviderAudit_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
