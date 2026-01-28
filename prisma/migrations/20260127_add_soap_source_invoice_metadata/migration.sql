-- Add INVOICE_METADATA to SOAPSourceType enum
-- This allows tracking SOAP notes generated from invoice metadata (Heyflow patients)

ALTER TYPE "SOAPSourceType" ADD VALUE IF NOT EXISTS 'INVOICE_METADATA';
