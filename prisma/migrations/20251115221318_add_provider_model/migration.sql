-- CreateTable
CREATE TABLE "Provider" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
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
    "npiRawResponse" JSONB
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    CONSTRAINT "Order_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "errorMessage", "id", "lifefileOrderId", "messageId", "patientId", "primaryMedForm", "primaryMedName", "primaryMedStrength", "providerId", "referenceId", "requestJson", "responseJson", "shippingMethod", "status", "updatedAt") SELECT "createdAt", "errorMessage", "id", "lifefileOrderId", "messageId", "patientId", "primaryMedForm", "primaryMedName", "primaryMedStrength", "providerId", "referenceId", "requestJson", "responseJson", "shippingMethod", "status", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Provider_npi_key" ON "Provider"("npi");
