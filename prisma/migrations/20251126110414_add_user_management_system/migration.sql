-- AlterTable
ALTER TABLE "Provider" ADD COLUMN "lastLogin" DATETIME;
ALTER TABLE "Provider" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "Provider" ADD COLUMN "passwordResetExpires" DATETIME;
ALTER TABLE "Provider" ADD COLUMN "passwordResetToken" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "PaymentMethod_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SOAPNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "SOAPNote_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SOAPNote_intakeDocumentId_fkey" FOREIGN KEY ("intakeDocumentId") REFERENCES "PatientDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SOAPNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SOAPNoteRevision" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soapNoteId" INTEGER NOT NULL,
    "editorEmail" TEXT,
    "editorRole" TEXT,
    "previousContent" JSONB NOT NULL,
    "newContent" JSONB NOT NULL,
    "changeReason" TEXT,
    CONSTRAINT "SOAPNoteRevision_soapNoteId_fkey" FOREIGN KEY ("soapNoteId") REFERENCES "SOAPNote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "patientId" INTEGER,
    "userEmail" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" DATETIME,
    CONSTRAINT "AIConversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "queryType" TEXT,
    "citations" JSONB,
    "confidence" REAL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estimatedCost" REAL,
    "responseTimeMs" INTEGER,
    CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "Subscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Influencer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "metadata" JSONB
);

-- CreateTable
CREATE TABLE "InfluencerBankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "influencerId" INTEGER NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'checking',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "InfluencerBankAccount_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralTracking" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "ReferralTracking_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralTracking_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "Commission_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Commission_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "ReferralTracking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Commission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Commission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "CommissionPayout" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "influencerId" INTEGER NOT NULL,
    "payoutMethod" TEXT NOT NULL,
    "payoutReference" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" DATETIME,
    "failureReason" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    CONSTRAINT "CommissionPayout_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserAuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Patient" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "sourceMetadata" JSONB
);
INSERT INTO "new_Patient" ("address1", "address2", "city", "createdAt", "dob", "email", "firstName", "gender", "id", "lastName", "lifefileId", "notes", "patientId", "phone", "state", "tags", "zip") SELECT "address1", "address2", "city", "createdAt", "dob", "email", "firstName", "gender", "id", "lastName", "lifefileId", "notes", "patientId", "phone", "state", "tags", "zip" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE UNIQUE INDEX "Patient_patientId_key" ON "Patient"("patientId");
CREATE UNIQUE INDEX "Patient_stripeCustomerId_key" ON "Patient"("stripeCustomerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_stripePaymentMethodId_key" ON "PaymentMethod"("stripePaymentMethodId");

-- CreateIndex
CREATE INDEX "SOAPNote_patientId_status_idx" ON "SOAPNote"("patientId", "status");

-- CreateIndex
CREATE INDEX "SOAPNoteRevision_soapNoteId_idx" ON "SOAPNoteRevision"("soapNoteId");

-- CreateIndex
CREATE INDEX "AIConversation_sessionId_idx" ON "AIConversation"("sessionId");

-- CreateIndex
CREATE INDEX "AIConversation_patientId_idx" ON "AIConversation"("patientId");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_idx" ON "AIMessage"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_patientId_idx" ON "Subscription"("patientId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_email_key" ON "Influencer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_promoCode_key" ON "Influencer"("promoCode");

-- CreateIndex
CREATE INDEX "Influencer_promoCode_idx" ON "Influencer"("promoCode");

-- CreateIndex
CREATE INDEX "Influencer_email_idx" ON "Influencer"("email");

-- CreateIndex
CREATE INDEX "InfluencerBankAccount_influencerId_idx" ON "InfluencerBankAccount"("influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralTracking_patientId_key" ON "ReferralTracking"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralTracking_conversionInvoiceId_key" ON "ReferralTracking"("conversionInvoiceId");

-- CreateIndex
CREATE INDEX "ReferralTracking_influencerId_idx" ON "ReferralTracking"("influencerId");

-- CreateIndex
CREATE INDEX "ReferralTracking_patientId_idx" ON "ReferralTracking"("patientId");

-- CreateIndex
CREATE INDEX "ReferralTracking_referralExpiresAt_idx" ON "ReferralTracking"("referralExpiresAt");

-- CreateIndex
CREATE INDEX "ReferralTracking_isConverted_idx" ON "ReferralTracking"("isConverted");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_invoiceId_key" ON "Commission"("invoiceId");

-- CreateIndex
CREATE INDEX "Commission_influencerId_idx" ON "Commission"("influencerId");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE INDEX "Commission_payoutId_idx" ON "Commission"("payoutId");

-- CreateIndex
CREATE INDEX "Commission_invoiceId_idx" ON "Commission"("invoiceId");

-- CreateIndex
CREATE INDEX "CommissionPayout_influencerId_idx" ON "CommissionPayout"("influencerId");

-- CreateIndex
CREATE INDEX "CommissionPayout_status_idx" ON "CommissionPayout"("status");

-- CreateIndex
CREATE INDEX "WebhookLog_endpoint_createdAt_idx" ON "WebhookLog"("endpoint", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookLog_status_createdAt_idx" ON "WebhookLog"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_providerId_key" ON "User"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_influencerId_key" ON "User"("influencerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_patientId_key" ON "User"("patientId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_token_key" ON "UserSession"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_refreshToken_key" ON "UserSession"("refreshToken");

-- CreateIndex
CREATE INDEX "UserSession_token_idx" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "UserSession_userId_expiresAt_idx" ON "UserSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "UserAuditLog_userId_createdAt_idx" ON "UserAuditLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UserAuditLog_action_createdAt_idx" ON "UserAuditLog"("action", "createdAt" DESC);
