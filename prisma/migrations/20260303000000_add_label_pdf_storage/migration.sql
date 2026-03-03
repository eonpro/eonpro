-- AlterTable: Store label PDF data directly for reliable retrieval
ALTER TABLE "ShipmentLabel" ADD COLUMN "labelPdfBase64" TEXT;
