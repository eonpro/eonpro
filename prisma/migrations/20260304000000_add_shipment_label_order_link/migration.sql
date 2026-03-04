-- Link ShipmentLabel to Order for tracking prescription shipments
ALTER TABLE "ShipmentLabel" ADD COLUMN "orderId" INTEGER;

-- Foreign key constraint
ALTER TABLE "ShipmentLabel" ADD CONSTRAINT "ShipmentLabel_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for looking up labels by order
CREATE INDEX "ShipmentLabel_orderId_idx" ON "ShipmentLabel"("orderId");
