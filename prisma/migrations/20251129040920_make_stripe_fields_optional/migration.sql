-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicId" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "stripeInvoiceId" TEXT,
    "stripeInvoiceNumber" TEXT,
    "stripeInvoiceUrl" TEXT,
    "stripePdfUrl" TEXT,
    "patientId" INTEGER NOT NULL,
    "description" TEXT,
    "amount" INTEGER,
    "amountDue" INTEGER,
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
INSERT INTO "new_Invoice" ("amountDue", "amountPaid", "clinicId", "commissionGenerated", "createdAt", "currency", "description", "dueDate", "id", "lineItems", "metadata", "orderId", "paidAt", "patientId", "status", "stripeInvoiceId", "stripeInvoiceNumber", "stripeInvoiceUrl", "stripePdfUrl", "updatedAt") SELECT "amountDue", "amountPaid", "clinicId", "commissionGenerated", "createdAt", "currency", "description", "dueDate", "id", "lineItems", "metadata", "orderId", "paidAt", "patientId", "status", "stripeInvoiceId", "stripeInvoiceNumber", "stripeInvoiceUrl", "stripePdfUrl", "updatedAt" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
