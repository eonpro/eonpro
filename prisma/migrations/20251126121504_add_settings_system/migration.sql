-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" INTEGER,
    CONSTRAINT "SystemSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "config" JSONB NOT NULL,
    "credentials" JSONB,
    "webhookUrl" TEXT,
    "lastSyncAt" DATETIME,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" INTEGER,
    CONSTRAINT "Integration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "rateLimit" INTEGER NOT NULL DEFAULT 1000,
    "expiresAt" DATETIME,
    "lastUsedAt" DATETIME,
    "lastUsedIp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "integrationId" INTEGER,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiUsageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "apiKeyId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiUsageLog_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "headers" JSONB,
    "secret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "retryPolicy" JSONB,
    "integrationId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebhookConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "webhookId" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "statusCode" INTEGER,
    "response" JSONB,
    "error" TEXT,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookConfig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "integrationId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeveloperTool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "lastCheckAt" DATETIME,
    "healthStatus" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SystemSettings_category_idx" ON "SystemSettings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_category_key_key" ON "SystemSettings"("category", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_name_key" ON "Integration"("name");

-- CreateIndex
CREATE INDEX "Integration_provider_status_idx" ON "Integration"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");

-- CreateIndex
CREATE INDEX "ApiUsageLog_apiKeyId_createdAt_idx" ON "ApiUsageLog"("apiKeyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApiUsageLog_endpoint_createdAt_idx" ON "ApiUsageLog"("endpoint", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookConfig_isActive_idx" ON "WebhookConfig"("isActive");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_status_idx" ON "WebhookDelivery"("webhookId", "status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "IntegrationLog_integrationId_createdAt_idx" ON "IntegrationLog"("integrationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IntegrationLog_status_createdAt_idx" ON "IntegrationLog"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperTool_name_key" ON "DeveloperTool"("name");

-- CreateIndex
CREATE INDEX "DeveloperTool_category_idx" ON "DeveloperTool"("category");
