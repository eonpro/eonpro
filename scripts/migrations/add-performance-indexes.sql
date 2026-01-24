-- PERFORMANCE OPTIMIZATION: Database Indexes
-- ==========================================
-- This migration adds optimized indexes for common query patterns
-- Run ANALYZE after applying to update query planner statistics

-- =============================================================================
-- PATIENT INDEXES (Most queried table)
-- =============================================================================

-- Composite index for clinic + search (name lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_clinicId_lastName_firstName_idx" 
ON "Patient" ("clinicId", "lastName", "firstName");

-- Index for patient portal login
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_email_clinicId_idx" 
ON "Patient" ("email", "clinicId") WHERE "email" IS NOT NULL;

-- Index for phone lookup (SMS/Twilio)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_phone_idx" 
ON "Patient" ("phone") WHERE "phone" IS NOT NULL;

-- Index for recent patients dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_clinicId_createdAt_idx" 
ON "Patient" ("clinicId", "createdAt" DESC);

-- Index for Stripe customer lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Patient_stripeCustomerId_idx" 
ON "Patient" ("stripeCustomerId") WHERE "stripeCustomerId" IS NOT NULL;


-- =============================================================================
-- ORDER INDEXES
-- =============================================================================

-- Composite for clinic + status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_clinicId_status_createdAt_idx" 
ON "Order" ("clinicId", "status", "createdAt" DESC);

-- Patient order history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_patientId_createdAt_idx" 
ON "Order" ("patientId", "createdAt" DESC);

-- Pending orders dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_clinicId_status_idx_pending" 
ON "Order" ("clinicId") WHERE "status" = 'PENDING';


-- =============================================================================
-- INVOICE INDEXES
-- =============================================================================

-- Clinic billing dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_clinicId_status_createdAt_idx" 
ON "Invoice" ("clinicId", "status", "createdAt" DESC);

-- Overdue invoices
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_clinicId_status_dueDate_idx_overdue" 
ON "Invoice" ("clinicId", "dueDate") WHERE "status" = 'OPEN' OR "status" = 'OVERDUE';

-- Patient billing history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_patientId_createdAt_idx" 
ON "Invoice" ("patientId", "createdAt" DESC);

-- Stripe invoice lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Invoice_stripeInvoiceId_idx" 
ON "Invoice" ("stripeInvoiceId") WHERE "stripeInvoiceId" IS NOT NULL;


-- =============================================================================
-- PAYMENT INDEXES
-- =============================================================================

-- Payment reconciliation
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_clinicId_createdAt_idx" 
ON "Payment" ("clinicId", "createdAt" DESC);

-- Payment by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_status_createdAt_idx" 
ON "Payment" ("status", "createdAt" DESC);

-- Stripe payment lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_stripePaymentIntentId_idx" 
ON "Payment" ("stripePaymentIntentId") WHERE "stripePaymentIntentId" IS NOT NULL;


-- =============================================================================
-- APPOINTMENT INDEXES
-- =============================================================================

-- Provider schedule view
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_providerId_scheduledAt_idx" 
ON "Appointment" ("providerId", "scheduledAt");

-- Clinic calendar view
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_clinicId_scheduledAt_idx" 
ON "Appointment" ("clinicId", "scheduledAt");

-- Patient upcoming appointments
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_patientId_scheduledAt_idx" 
ON "Appointment" ("patientId", "scheduledAt") 
WHERE "status" != 'CANCELLED';

-- Today's appointments (partial index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_clinicId_status_scheduledAt_idx" 
ON "Appointment" ("clinicId", "status", "scheduledAt");


-- =============================================================================
-- PRESCRIPTION INDEXES
-- =============================================================================

-- Active prescriptions
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Prescription_patientId_status_idx" 
ON "Prescription" ("patientId", "status");

-- Pending prescriptions dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Prescription_clinicId_status_createdAt_idx" 
ON "Prescription" ("clinicId", "status", "createdAt" DESC) 
WHERE "status" IN ('PENDING', 'SUBMITTED');

-- DEA number lookup for controlled substances
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Prescription_deaNumber_idx" 
ON "Prescription" ("deaNumber") WHERE "deaNumber" IS NOT NULL;


-- =============================================================================
-- SOAP NOTE INDEXES
-- =============================================================================

-- Patient chart history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SOAPNote_patientId_createdAt_idx" 
ON "SOAPNote" ("patientId", "createdAt" DESC);

-- Provider notes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SOAPNote_providerId_createdAt_idx" 
ON "SOAPNote" ("providerId", "createdAt" DESC);

-- Unsigned notes dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SOAPNote_clinicId_signedAt_idx_unsigned" 
ON "SOAPNote" ("clinicId", "createdAt" DESC) WHERE "signedAt" IS NULL;


-- =============================================================================
-- TICKET/SUPPORT INDEXES
-- =============================================================================

-- Open tickets dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Ticket_clinicId_status_priority_idx" 
ON "Ticket" ("clinicId", "status", "priority") 
WHERE "status" NOT IN ('RESOLVED', 'CLOSED');

-- Assigned tickets
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Ticket_assignedToId_status_idx" 
ON "Ticket" ("assignedToId", "status") WHERE "assignedToId" IS NOT NULL;


-- =============================================================================
-- AUDIT LOG INDEXES
-- =============================================================================

-- Audit trail queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_userId_createdAt_idx" 
ON "AuditLog" ("userId", "createdAt" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_resource_resourceId_idx" 
ON "AuditLog" ("resource", "resourceId") WHERE "resource" IS NOT NULL;


-- =============================================================================
-- PATIENT HEALTH TRACKING INDEXES
-- =============================================================================

-- Weight history chart
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientWeightLog_patientId_recordedAt_idx" 
ON "PatientWeightLog" ("patientId", "recordedAt" DESC);

-- Exercise tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientExerciseLog_patientId_recordedAt_idx" 
ON "PatientExerciseLog" ("patientId", "recordedAt" DESC);

-- Sleep tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientSleepLog_patientId_recordedAt_idx" 
ON "PatientSleepLog" ("patientId", "recordedAt" DESC);

-- Nutrition tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientNutritionLog_patientId_recordedAt_idx" 
ON "PatientNutritionLog" ("patientId", "recordedAt" DESC);


-- =============================================================================
-- CHAT MESSAGE INDEXES
-- =============================================================================

-- Patient conversation history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientChatMessage_patientId_createdAt_idx" 
ON "PatientChatMessage" ("patientId", "createdAt" DESC);

-- Unread messages
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PatientChatMessage_patientId_readAt_idx_unread" 
ON "PatientChatMessage" ("patientId", "direction") WHERE "readAt" IS NULL;


-- =============================================================================
-- UPDATE STATISTICS
-- =============================================================================

-- Analyze tables to update query planner statistics
ANALYZE "Patient";
ANALYZE "Order";
ANALYZE "Invoice";
ANALYZE "Payment";
ANALYZE "Appointment";
ANALYZE "Prescription";
ANALYZE "SOAPNote";
ANALYZE "Ticket";
ANALYZE "AuditLog";
ANALYZE "PatientWeightLog";
ANALYZE "PatientChatMessage";
