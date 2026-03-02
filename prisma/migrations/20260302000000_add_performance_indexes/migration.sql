-- Performance indexes for critical query paths
-- Addresses: slow order list, N+1 joins, unindexed foreign keys

-- Rx → Order join: used in every order list query that includes prescriptions
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Rx_orderId_idx" ON "Rx" ("orderId");

-- OrderEvent → Order join: used in order detail and order list views
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OrderEvent_orderId_idx" ON "OrderEvent" ("orderId");

-- Order → Patient: used in patient order history, order search by patient
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_patientId_idx" ON "Order" ("patientId");

-- Order → Provider: used in provider order views
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_providerId_idx" ON "Order" ("providerId");

-- Order tracking number: used in "With Tracking" tab and shipping webhook matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_trackingNumber_idx" ON "Order" ("trackingNumber")
  WHERE "trackingNumber" IS NOT NULL;

-- Order lifefileOrderId: used in webhook processing and external lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_lifefileOrderId_idx" ON "Order" ("lifefileOrderId")
  WHERE "lifefileOrderId" IS NOT NULL;

-- Order createdAt: used in date-range filters and default sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_createdAt_idx" ON "Order" ("createdAt" DESC);

-- Order lastWebhookAt: used in "With Tracking" sort order
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_lastWebhookAt_idx" ON "Order" ("lastWebhookAt" DESC NULLS LAST)
  WHERE "lastWebhookAt" IS NOT NULL;

-- SmsLog: templateType + patientId composite for tracking SMS lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SmsLog_templateType_patientId_idx"
  ON "SmsLog" ("templateType", "patientId")
  WHERE "templateType" IS NOT NULL;
