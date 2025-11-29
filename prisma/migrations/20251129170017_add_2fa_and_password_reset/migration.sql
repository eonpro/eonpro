-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" INTEGER,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "clinicId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" DATETIME,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clinicId" INTEGER,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "permissions" JSONB,
    "features" JSONB,
    "metadata" JSONB,
    "lastLogin" DATETIME,
    "lastPasswordChange" DATETIME,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorBackupCodes" JSONB DEFAULT [],
    "twoFactorVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" INTEGER,
    "providerId" INTEGER,
    "influencerId" INTEGER,
    "patientId" INTEGER,
    CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("clinicId", "createdAt", "createdById", "email", "failedLoginAttempts", "features", "firstName", "id", "influencerId", "lastLogin", "lastName", "lastPasswordChange", "lockedUntil", "metadata", "passwordHash", "patientId", "permissions", "providerId", "role", "status", "updatedAt") SELECT "clinicId", "createdAt", "createdById", "email", "failedLoginAttempts", "features", "firstName", "id", "influencerId", "lastLogin", "lastName", "lastPasswordChange", "lockedUntil", "metadata", "passwordHash", "patientId", "permissions", "providerId", "role", "status", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_providerId_key" ON "User"("providerId");
CREATE UNIQUE INDEX "User_influencerId_key" ON "User"("influencerId");
CREATE UNIQUE INDEX "User_patientId_key" ON "User"("patientId");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt" DESC);
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
