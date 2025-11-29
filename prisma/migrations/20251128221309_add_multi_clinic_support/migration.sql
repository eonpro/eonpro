-- CreateTable
CREATE TABLE "Clinic" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "customDomain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "settings" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "integrations" JSONB NOT NULL,
    "billingPlan" TEXT NOT NULL DEFAULT 'starter',
    "patientLimit" INTEGER NOT NULL DEFAULT 100,
    "providerLimit" INTEGER NOT NULL DEFAULT 5,
    "storageLimit" INTEGER NOT NULL DEFAULT 5000,
    "adminEmail" TEXT NOT NULL,
    "supportEmail" TEXT,
    "phone" TEXT,
    "address" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "secondaryColor" TEXT NOT NULL DEFAULT '#10B981',
    "customCss" TEXT,
    "databaseUrl" TEXT,
    "schemaName" TEXT
);

-- CreateTable
CREATE TABLE "ClinicAuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "userId" INTEGER,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "ClinicAuditLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClinicAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AIConversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "patientId" INTEGER,
    "userEmail" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" DATETIME,
    CONSTRAINT "AIConversation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AIConversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AIConversation" ("createdAt", "id", "isActive", "lastMessageAt", "patientId", "sessionId", "updatedAt", "userEmail") SELECT "createdAt", "id", "isActive", "lastMessageAt", "patientId", "sessionId", "updatedAt", "userEmail" FROM "AIConversation";
DROP TABLE "AIConversation";
ALTER TABLE "new_AIConversation" RENAME TO "AIConversation";
CREATE INDEX "AIConversation_sessionId_idx" ON "AIConversation"("sessionId");
CREATE INDEX "AIConversation_patientId_idx" ON "AIConversation"("patientId");
CREATE TABLE "new_ApiKey" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clinicId" INTEGER,
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
    CONSTRAINT "ApiKey_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApiKey_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ApiKey" ("createdAt", "expiresAt", "hashedKey", "id", "integrationId", "key", "lastUsedAt", "lastUsedIp", "name", "permissions", "prefix", "rateLimit", "status", "userId") SELECT "createdAt", "expiresAt", "hashedKey", "id", "integrationId", "key", "lastUsedAt", "lastUsedIp", "name", "permissions", "prefix", "rateLimit", "status", "userId" FROM "ApiKey";
DROP TABLE "ApiKey";
ALTER TABLE "new_ApiKey" RENAME TO "ApiKey";
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");
CREATE TABLE "new_Commission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "influencerId" INTEGER NOT NULL,
    "referralId" INTEGER NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "orderAmount" INTEGER NOT NULL,
    "commissionRate" REAL NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutId" INTEGER,
    "notes" TEXT,
    "metadata" JSONB,
    CONSTRAINT "Commission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Commission_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Commission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "ReferralTracking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Commission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Commission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "CommissionPayout" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Commission" ("commissionAmount", "commissionRate", "createdAt", "id", "influencerId", "invoiceId", "metadata", "notes", "orderAmount", "payoutId", "referralId", "status", "updatedAt") SELECT "commissionAmount", "commissionRate", "createdAt", "id", "influencerId", "invoiceId", "metadata", "notes", "orderAmount", "payoutId", "referralId", "status", "updatedAt" FROM "Commission";
DROP TABLE "Commission";
ALTER TABLE "new_Commission" RENAME TO "Commission";
CREATE UNIQUE INDEX "Commission_invoiceId_key" ON "Commission"("invoiceId");
CREATE INDEX "Commission_influencerId_idx" ON "Commission"("influencerId");
CREATE INDEX "Commission_status_idx" ON "Commission"("status");
CREATE INDEX "Commission_payoutId_idx" ON "Commission"("payoutId");
CREATE INDEX "Commission_invoiceId_idx" ON "Commission"("invoiceId");
CREATE TABLE "new_Influencer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "promoCode" TEXT NOT NULL,
    "commissionRate" REAL NOT NULL DEFAULT 0.10,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpires" DATETIME,
    "lastLogin" DATETIME,
    "phone" TEXT,
    "paypalEmail" TEXT,
    "preferredPaymentMethod" TEXT DEFAULT 'paypal',
    "notes" TEXT,
    "metadata" JSONB,
    CONSTRAINT "Influencer_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Influencer" ("commissionRate", "createdAt", "email", "id", "lastLogin", "metadata", "name", "notes", "passwordHash", "passwordResetExpires", "passwordResetToken", "paypalEmail", "phone", "preferredPaymentMethod", "promoCode", "status", "updatedAt") SELECT "commissionRate", "createdAt", "email", "id", "lastLogin", "metadata", "name", "notes", "passwordHash", "passwordResetExpires", "passwordResetToken", "paypalEmail", "phone", "preferredPaymentMethod", "promoCode", "status", "updatedAt" FROM "Influencer";
DROP TABLE "Influencer";
ALTER TABLE "new_Influencer" RENAME TO "Influencer";
CREATE UNIQUE INDEX "Influencer_email_key" ON "Influencer"("email");
CREATE UNIQUE INDEX "Influencer_promoCode_key" ON "Influencer"("promoCode");
CREATE INDEX "Influencer_promoCode_idx" ON "Influencer"("promoCode");
CREATE INDEX "Influencer_email_idx" ON "Influencer"("email");
CREATE TABLE "new_IntakeFormTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "treatmentType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "providerId" INTEGER,
    "createdById" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    CONSTRAINT "IntakeFormTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IntakeFormTemplate_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IntakeFormTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IntakeFormTemplate" ("createdAt", "createdById", "description", "id", "isActive", "metadata", "name", "providerId", "treatmentType", "updatedAt", "version") SELECT "createdAt", "createdById", "description", "id", "isActive", "metadata", "name", "providerId", "treatmentType", "updatedAt", "version" FROM "IntakeFormTemplate";
DROP TABLE "IntakeFormTemplate";
ALTER TABLE "new_IntakeFormTemplate" RENAME TO "IntakeFormTemplate";
CREATE INDEX "IntakeFormTemplate_treatmentType_isActive_idx" ON "IntakeFormTemplate"("treatmentType", "isActive");
CREATE INDEX "IntakeFormTemplate_providerId_idx" ON "IntakeFormTemplate"("providerId");
CREATE INDEX "IntakeFormTemplate_createdById_idx" ON "IntakeFormTemplate"("createdById");
CREATE TABLE "new_Integration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clinicId" INTEGER,
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
    CONSTRAINT "Integration_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Integration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Integration" ("config", "createdAt", "createdById", "credentials", "errorCount", "id", "lastError", "lastSyncAt", "metadata", "name", "provider", "status", "updatedAt", "webhookUrl") SELECT "config", "createdAt", "createdById", "credentials", "errorCount", "id", "lastError", "lastSyncAt", "metadata", "name", "provider", "status", "updatedAt", "webhookUrl" FROM "Integration";
DROP TABLE "Integration";
ALTER TABLE "new_Integration" RENAME TO "Integration";
CREATE UNIQUE INDEX "Integration_name_key" ON "Integration"("name");
CREATE INDEX "Integration_provider_status_idx" ON "Integration"("provider", "status");
CREATE TABLE "new_InternalMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "senderId" INTEGER NOT NULL,
    "recipientId" INTEGER,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "attachments" JSONB,
    "messageType" TEXT NOT NULL DEFAULT 'DIRECT',
    "channelId" TEXT,
    "parentMessageId" INTEGER,
    "metadata" JSONB,
    CONSTRAINT "InternalMessage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InternalMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InternalMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InternalMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "InternalMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InternalMessage" ("attachments", "channelId", "createdAt", "id", "isRead", "message", "messageType", "metadata", "parentMessageId", "readAt", "recipientId", "senderId") SELECT "attachments", "channelId", "createdAt", "id", "isRead", "message", "messageType", "metadata", "parentMessageId", "readAt", "recipientId", "senderId" FROM "InternalMessage";
DROP TABLE "InternalMessage";
ALTER TABLE "new_InternalMessage" RENAME TO "InternalMessage";
CREATE INDEX "InternalMessage_senderId_createdAt_idx" ON "InternalMessage"("senderId", "createdAt");
CREATE INDEX "InternalMessage_recipientId_isRead_idx" ON "InternalMessage"("recipientId", "isRead");
CREATE INDEX "InternalMessage_channelId_createdAt_idx" ON "InternalMessage"("channelId", "createdAt");
CREATE TABLE "new_Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripeInvoiceNumber" TEXT,
    "stripeInvoiceUrl" TEXT,
    "stripePdfUrl" TEXT,
    "patientId" INTEGER NOT NULL,
    "description" TEXT,
    "amountDue" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dueDate" DATETIME,
    "paidAt" DATETIME,
    "lineItems" JSONB,
    "metadata" JSONB,
    "orderId" INTEGER,
    "commissionGenerated" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Invoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amountDue", "amountPaid", "commissionGenerated", "createdAt", "currency", "description", "dueDate", "id", "lineItems", "metadata", "orderId", "paidAt", "patientId", "status", "stripeInvoiceId", "stripeInvoiceNumber", "stripeInvoiceUrl", "stripePdfUrl", "updatedAt") SELECT "amountDue", "amountPaid", "commissionGenerated", "createdAt", "currency", "description", "dueDate", "id", "lineItems", "metadata", "orderId", "paidAt", "patientId", "status", "stripeInvoiceId", "stripeInvoiceNumber", "stripeInvoiceUrl", "stripePdfUrl", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "messageId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "lifefileOrderId" TEXT,
    "status" TEXT,
    "patientId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "shippingMethod" INTEGER NOT NULL,
    "primaryMedName" TEXT,
    "primaryMedStrength" TEXT,
    "primaryMedForm" TEXT,
    "errorMessage" TEXT,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "lastWebhookAt" DATETIME,
    "lastWebhookPayload" TEXT,
    "shippingStatus" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    CONSTRAINT "Order_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "errorMessage", "id", "lastWebhookAt", "lastWebhookPayload", "lifefileOrderId", "messageId", "patientId", "primaryMedForm", "primaryMedName", "primaryMedStrength", "providerId", "referenceId", "requestJson", "responseJson", "shippingMethod", "shippingStatus", "status", "trackingNumber", "trackingUrl", "updatedAt") SELECT "createdAt", "errorMessage", "id", "lastWebhookAt", "lastWebhookPayload", "lifefileOrderId", "messageId", "patientId", "primaryMedForm", "primaryMedName", "primaryMedStrength", "providerId", "referenceId", "requestJson", "responseJson", "shippingMethod", "shippingStatus", "status", "trackingNumber", "trackingUrl", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE TABLE "new_Patient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "lifefileId" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "address2" TEXT,
    "patientId" TEXT,
    "stripeCustomerId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceMetadata" JSONB,
    CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("address1", "address2", "city", "createdAt", "dob", "email", "firstName", "gender", "id", "lastName", "lifefileId", "notes", "patientId", "phone", "source", "sourceMetadata", "state", "stripeCustomerId", "tags", "zip") SELECT "address1", "address2", "city", "createdAt", "dob", "email", "firstName", "gender", "id", "lastName", "lifefileId", "notes", "patientId", "phone", "source", "sourceMetadata", "state", "stripeCustomerId", "tags", "zip" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE UNIQUE INDEX "Patient_patientId_key" ON "Patient"("patientId");
CREATE UNIQUE INDEX "Patient_stripeCustomerId_key" ON "Patient"("stripeCustomerId");
CREATE INDEX "Patient_clinicId_idx" ON "Patient"("clinicId");
CREATE UNIQUE INDEX "Patient_clinicId_patientId_key" ON "Patient"("clinicId", "patientId");
CREATE TABLE "new_PatientDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "patientId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "source" TEXT,
    "data" BLOB,
    "externalUrl" TEXT,
    "sourceSubmissionId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    CONSTRAINT "PatientDocument_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PatientDocument" ("category", "createdAt", "data", "externalUrl", "filename", "id", "mimeType", "patientId", "source", "sourceSubmissionId") SELECT "category", "createdAt", "data", "externalUrl", "filename", "id", "mimeType", "patientId", "source", "sourceSubmissionId" FROM "PatientDocument";
DROP TABLE "PatientDocument";
ALTER TABLE "new_PatientDocument" RENAME TO "PatientDocument";
CREATE UNIQUE INDEX "PatientDocument_sourceSubmissionId_key" ON "PatientDocument"("sourceSubmissionId");
CREATE TABLE "new_Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "failureReason" TEXT,
    "patientId" INTEGER NOT NULL,
    "invoiceId" INTEGER,
    "subscriptionId" INTEGER,
    "description" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    CONSTRAINT "Payment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "createdAt", "currency", "description", "failureReason", "id", "invoiceId", "metadata", "notes", "patientId", "paymentMethod", "status", "stripeChargeId", "stripePaymentIntentId", "subscriptionId") SELECT "amount", "createdAt", "currency", "description", "failureReason", "id", "invoiceId", "metadata", "notes", "patientId", "paymentMethod", "status", "stripeChargeId", "stripePaymentIntentId", "subscriptionId" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");
CREATE TABLE "new_PaymentMethod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "patientId" INTEGER NOT NULL,
    "encryptedCardNumber" TEXT NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "cardBrand" TEXT,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "cardholderName" TEXT NOT NULL,
    "encryptedCvv" TEXT,
    "billingZip" TEXT NOT NULL,
    "stripePaymentMethodId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" DATETIME,
    "encryptionKeyId" TEXT NOT NULL,
    "fingerprint" TEXT,
    CONSTRAINT "PaymentMethod_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentMethod_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PaymentMethod" ("billingZip", "cardBrand", "cardLast4", "cardholderName", "createdAt", "encryptedCardNumber", "encryptedCvv", "encryptionKeyId", "expiryMonth", "expiryYear", "fingerprint", "id", "isActive", "isDefault", "lastUsedAt", "patientId", "stripePaymentMethodId", "updatedAt") SELECT "billingZip", "cardBrand", "cardLast4", "cardholderName", "createdAt", "encryptedCardNumber", "encryptedCvv", "encryptionKeyId", "expiryMonth", "expiryYear", "fingerprint", "id", "isActive", "isDefault", "lastUsedAt", "patientId", "stripePaymentMethodId", "updatedAt" FROM "PaymentMethod";
DROP TABLE "PaymentMethod";
ALTER TABLE "new_PaymentMethod" RENAME TO "PaymentMethod";
CREATE UNIQUE INDEX "PaymentMethod_stripePaymentMethodId_key" ON "PaymentMethod"("stripePaymentMethodId");
CREATE TABLE "new_Provider" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "clinicId" INTEGER,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "titleLine" TEXT,
    "npi" TEXT NOT NULL,
    "licenseState" TEXT,
    "licenseNumber" TEXT,
    "dea" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "signatureDataUrl" TEXT,
    "npiVerifiedAt" DATETIME,
    "npiRawResponse" JSONB,
    "lastLogin" DATETIME,
    "passwordHash" TEXT,
    "passwordResetExpires" DATETIME,
    "passwordResetToken" TEXT,
    CONSTRAINT "Provider_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Provider" ("createdAt", "dea", "email", "firstName", "id", "lastLogin", "lastName", "licenseNumber", "licenseState", "npi", "npiRawResponse", "npiVerifiedAt", "passwordHash", "passwordResetExpires", "passwordResetToken", "phone", "signatureDataUrl", "titleLine", "updatedAt") SELECT "createdAt", "dea", "email", "firstName", "id", "lastLogin", "lastName", "licenseNumber", "licenseState", "npi", "npiRawResponse", "npiVerifiedAt", "passwordHash", "passwordResetExpires", "passwordResetToken", "phone", "signatureDataUrl", "titleLine", "updatedAt" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
CREATE UNIQUE INDEX "Provider_npi_key" ON "Provider"("npi");
CREATE TABLE "new_ReferralTracking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "patientId" INTEGER NOT NULL,
    "influencerId" INTEGER NOT NULL,
    "promoCode" TEXT NOT NULL,
    "referralSource" TEXT,
    "referralExpiresAt" DATETIME NOT NULL,
    "isConverted" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" DATETIME,
    "conversionInvoiceId" INTEGER,
    "metadata" JSONB,
    CONSTRAINT "ReferralTracking_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReferralTracking_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralTracking_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ReferralTracking" ("conversionInvoiceId", "convertedAt", "createdAt", "id", "influencerId", "isConverted", "metadata", "patientId", "promoCode", "referralExpiresAt", "referralSource", "updatedAt") SELECT "conversionInvoiceId", "convertedAt", "createdAt", "id", "influencerId", "isConverted", "metadata", "patientId", "promoCode", "referralExpiresAt", "referralSource", "updatedAt" FROM "ReferralTracking";
DROP TABLE "ReferralTracking";
ALTER TABLE "new_ReferralTracking" RENAME TO "ReferralTracking";
CREATE UNIQUE INDEX "ReferralTracking_patientId_key" ON "ReferralTracking"("patientId");
CREATE UNIQUE INDEX "ReferralTracking_conversionInvoiceId_key" ON "ReferralTracking"("conversionInvoiceId");
CREATE INDEX "ReferralTracking_influencerId_idx" ON "ReferralTracking"("influencerId");
CREATE INDEX "ReferralTracking_patientId_idx" ON "ReferralTracking"("patientId");
CREATE INDEX "ReferralTracking_referralExpiresAt_idx" ON "ReferralTracking"("referralExpiresAt");
CREATE INDEX "ReferralTracking_isConverted_idx" ON "ReferralTracking"("isConverted");
CREATE TABLE "new_SOAPNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "patientId" INTEGER NOT NULL,
    "subjective" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "assessment" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "intakeDocumentId" INTEGER,
    "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
    "aiModelVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" INTEGER,
    "approvedAt" DATETIME,
    "lockedAt" DATETIME,
    "editPasswordHash" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estimatedCost" REAL,
    "medicalNecessity" TEXT,
    CONSTRAINT "SOAPNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SOAPNote_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SOAPNote_intakeDocumentId_fkey" FOREIGN KEY ("intakeDocumentId") REFERENCES "PatientDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SOAPNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SOAPNote" ("aiModelVersion", "approvedAt", "approvedBy", "assessment", "completionTokens", "createdAt", "editPasswordHash", "estimatedCost", "generatedByAI", "id", "intakeDocumentId", "lockedAt", "medicalNecessity", "objective", "patientId", "plan", "promptTokens", "sourceType", "status", "subjective", "updatedAt") SELECT "aiModelVersion", "approvedAt", "approvedBy", "assessment", "completionTokens", "createdAt", "editPasswordHash", "estimatedCost", "generatedByAI", "id", "intakeDocumentId", "lockedAt", "medicalNecessity", "objective", "patientId", "plan", "promptTokens", "sourceType", "status", "subjective", "updatedAt" FROM "SOAPNote";
DROP TABLE "SOAPNote";
ALTER TABLE "new_SOAPNote" RENAME TO "SOAPNote";
CREATE INDEX "SOAPNote_patientId_status_idx" ON "SOAPNote"("patientId", "status");
CREATE TABLE "new_Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "patientId" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "planDescription" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextBillingDate" DATETIME,
    "canceledAt" DATETIME,
    "pausedAt" DATETIME,
    "resumeAt" DATETIME,
    "endedAt" DATETIME,
    "paymentMethodId" INTEGER,
    "stripeSubscriptionId" TEXT,
    "metadata" JSONB,
    "lastPaymentId" INTEGER,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Subscription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Subscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Subscription" ("amount", "canceledAt", "createdAt", "currency", "currentPeriodEnd", "currentPeriodStart", "endedAt", "failedAttempts", "id", "interval", "intervalCount", "lastPaymentId", "metadata", "nextBillingDate", "patientId", "pausedAt", "paymentMethodId", "planDescription", "planId", "planName", "resumeAt", "startDate", "status", "stripeSubscriptionId", "updatedAt") SELECT "amount", "canceledAt", "createdAt", "currency", "currentPeriodEnd", "currentPeriodStart", "endedAt", "failedAttempts", "id", "interval", "intervalCount", "lastPaymentId", "metadata", "nextBillingDate", "patientId", "pausedAt", "paymentMethodId", "planDescription", "planId", "planName", "resumeAt", "startDate", "status", "stripeSubscriptionId", "updatedAt" FROM "Subscription";
DROP TABLE "Subscription";
ALTER TABLE "new_Subscription" RENAME TO "Subscription";
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE INDEX "Subscription_patientId_idx" ON "Subscription"("patientId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE TABLE "new_SystemSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clinicId" INTEGER,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" INTEGER,
    CONSTRAINT "SystemSettings_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SystemSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SystemSettings" ("category", "description", "id", "isEncrypted", "isPublic", "key", "updatedAt", "updatedById", "value") SELECT "category", "description", "id", "isEncrypted", "isPublic", "key", "updatedAt", "updatedById", "value" FROM "SystemSettings";
DROP TABLE "SystemSettings";
ALTER TABLE "new_SystemSettings" RENAME TO "SystemSettings";
CREATE INDEX "SystemSettings_category_idx" ON "SystemSettings"("category");
CREATE UNIQUE INDEX "SystemSettings_category_key_key" ON "SystemSettings"("category", "key");
CREATE TABLE "new_Ticket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "ticketNumber" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "disposition" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "patientId" INTEGER,
    "orderId" INTEGER,
    "isNonClientIssue" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "currentOwnerId" INTEGER,
    "lastWorkedById" INTEGER,
    "lastWorkedAt" DATETIME,
    "resolvedAt" DATETIME,
    "resolvedById" INTEGER,
    "resolutionNotes" TEXT,
    "resolutionTime" INTEGER,
    "actualWorkTime" INTEGER,
    "tags" JSONB,
    "customFields" JSONB,
    "attachments" JSONB,
    CONSTRAINT "Ticket_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_lastWorkedById_fkey" FOREIGN KEY ("lastWorkedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("actualWorkTime", "assignedToId", "attachments", "category", "createdAt", "createdById", "currentOwnerId", "customFields", "description", "disposition", "id", "isNonClientIssue", "lastWorkedAt", "lastWorkedById", "orderId", "patientId", "priority", "resolutionNotes", "resolutionTime", "resolvedAt", "resolvedById", "status", "tags", "ticketNumber", "title", "updatedAt") SELECT "actualWorkTime", "assignedToId", "attachments", "category", "createdAt", "createdById", "currentOwnerId", "customFields", "description", "disposition", "id", "isNonClientIssue", "lastWorkedAt", "lastWorkedById", "orderId", "patientId", "priority", "resolutionNotes", "resolutionTime", "resolvedAt", "resolvedById", "status", "tags", "ticketNumber", "title", "updatedAt" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE INDEX "Ticket_status_priority_createdAt_idx" ON "Ticket"("status", "priority", "createdAt");
CREATE INDEX "Ticket_assignedToId_status_idx" ON "Ticket"("assignedToId", "status");
CREATE INDEX "Ticket_patientId_idx" ON "Ticket"("patientId");
CREATE INDEX "Ticket_ticketNumber_idx" ON "Ticket"("ticketNumber");
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
INSERT INTO "new_User" ("createdAt", "createdById", "email", "failedLoginAttempts", "features", "firstName", "id", "influencerId", "lastLogin", "lastName", "lastPasswordChange", "lockedUntil", "metadata", "passwordHash", "patientId", "permissions", "providerId", "role", "status", "updatedAt") SELECT "createdAt", "createdById", "email", "failedLoginAttempts", "features", "firstName", "id", "influencerId", "lastLogin", "lastName", "lastPasswordChange", "lockedUntil", "metadata", "passwordHash", "patientId", "permissions", "providerId", "role", "status", "updatedAt" FROM "User";
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
CREATE TABLE "new_WebhookConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clinicId" INTEGER,
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
    CONSTRAINT "WebhookConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WebhookConfig_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WebhookConfig" ("createdAt", "events", "headers", "id", "integrationId", "isActive", "name", "retryPolicy", "secret", "updatedAt", "url") SELECT "createdAt", "events", "headers", "id", "integrationId", "isActive", "name", "retryPolicy", "secret", "updatedAt", "url" FROM "WebhookConfig";
DROP TABLE "WebhookConfig";
ALTER TABLE "new_WebhookConfig" RENAME TO "WebhookConfig";
CREATE INDEX "WebhookConfig_isActive_idx" ON "WebhookConfig"("isActive");
CREATE TABLE "new_WebhookLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clinicId" INTEGER,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "headers" JSONB,
    "payload" JSONB,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "responseData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "processingTimeMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WebhookLog" ("createdAt", "endpoint", "errorMessage", "headers", "id", "ipAddress", "method", "payload", "processingTimeMs", "responseData", "status", "statusCode", "userAgent") SELECT "createdAt", "endpoint", "errorMessage", "headers", "id", "ipAddress", "method", "payload", "processingTimeMs", "responseData", "status", "statusCode", "userAgent" FROM "WebhookLog";
DROP TABLE "WebhookLog";
ALTER TABLE "new_WebhookLog" RENAME TO "WebhookLog";
CREATE INDEX "WebhookLog_endpoint_createdAt_idx" ON "WebhookLog"("endpoint", "createdAt" DESC);
CREATE INDEX "WebhookLog_status_createdAt_idx" ON "WebhookLog"("status", "createdAt" DESC);
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt" DESC);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_subdomain_key" ON "Clinic"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_customDomain_key" ON "Clinic"("customDomain");

-- CreateIndex
CREATE INDEX "Clinic_subdomain_idx" ON "Clinic"("subdomain");

-- CreateIndex
CREATE INDEX "Clinic_status_idx" ON "Clinic"("status");

-- CreateIndex
CREATE INDEX "Clinic_customDomain_idx" ON "Clinic"("customDomain");

-- CreateIndex
CREATE INDEX "ClinicAuditLog_clinicId_createdAt_idx" ON "ClinicAuditLog"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicAuditLog_action_idx" ON "ClinicAuditLog"("action");
