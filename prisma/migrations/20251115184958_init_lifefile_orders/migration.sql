-- CreateTable
CREATE TABLE "Patient" (
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
    "lifefileId" TEXT
);

-- CreateTable
CREATE TABLE "Order" (
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
    CONSTRAINT "Order_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rx" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "medicationKey" TEXT NOT NULL,
    "medName" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "refills" TEXT NOT NULL,
    "sig" TEXT NOT NULL,
    CONSTRAINT "Rx_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
