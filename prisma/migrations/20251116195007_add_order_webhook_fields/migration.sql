-- AlterTable
ALTER TABLE "Order" ADD COLUMN "lastWebhookAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "lastWebhookPayload" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingUrl" TEXT;

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" INTEGER NOT NULL,
    "lifefileOrderId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "note" TEXT,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
