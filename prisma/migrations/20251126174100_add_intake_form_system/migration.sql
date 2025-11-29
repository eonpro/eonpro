-- CreateTable
CREATE TABLE "IntakeFormTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "treatmentType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "providerId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    CONSTRAINT "IntakeFormTemplate_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntakeFormQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "templateId" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "placeholder" TEXT,
    "helpText" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT,
    "conditionalLogic" JSONB,
    CONSTRAINT "IntakeFormQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IntakeFormTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntakeFormSubmission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "templateId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" DATETIME,
    "formLinkId" TEXT,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" DATETIME,
    "metadata" JSONB,
    "signature" TEXT,
    "signedAt" DATETIME,
    CONSTRAINT "IntakeFormSubmission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IntakeFormTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IntakeFormSubmission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IntakeFormSubmission_formLinkId_fkey" FOREIGN KEY ("formLinkId") REFERENCES "IntakeFormLink" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntakeFormResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answer" TEXT,
    "fileUrl" TEXT,
    CONSTRAINT "IntakeFormResponse_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "IntakeFormSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IntakeFormResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "IntakeFormQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntakeFormLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "templateId" INTEGER NOT NULL,
    "patientEmail" TEXT NOT NULL,
    "patientPhone" TEXT,
    "sentVia" TEXT,
    "sentAt" DATETIME,
    "clickedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    CONSTRAINT "IntakeFormLink_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "IntakeFormTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "IntakeFormTemplate_treatmentType_isActive_idx" ON "IntakeFormTemplate"("treatmentType", "isActive");

-- CreateIndex
CREATE INDEX "IntakeFormTemplate_providerId_idx" ON "IntakeFormTemplate"("providerId");

-- CreateIndex
CREATE INDEX "IntakeFormQuestion_templateId_orderIndex_idx" ON "IntakeFormQuestion"("templateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeFormSubmission_formLinkId_key" ON "IntakeFormSubmission"("formLinkId");

-- CreateIndex
CREATE INDEX "IntakeFormSubmission_patientId_status_idx" ON "IntakeFormSubmission"("patientId", "status");

-- CreateIndex
CREATE INDEX "IntakeFormSubmission_templateId_idx" ON "IntakeFormSubmission"("templateId");

-- CreateIndex
CREATE INDEX "IntakeFormResponse_submissionId_idx" ON "IntakeFormResponse"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeFormResponse_submissionId_questionId_key" ON "IntakeFormResponse"("submissionId", "questionId");

-- CreateIndex
CREATE INDEX "IntakeFormLink_patientEmail_isActive_idx" ON "IntakeFormLink"("patientEmail", "isActive");

-- CreateIndex
CREATE INDEX "IntakeFormLink_expiresAt_idx" ON "IntakeFormLink"("expiresAt");
