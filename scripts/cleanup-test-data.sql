-- ============================================
-- EONPRO Production Cleanup Script
-- Removes ALL test/dummy data from database
-- ============================================
-- 
-- ⚠️  WARNING: This script DELETES data permanently!
-- 
-- Run with:
--   psql $DATABASE_URL -f scripts/cleanup-test-data.sql
--
-- Or in your database client
-- ============================================

BEGIN;

-- Set search path
SET search_path TO public;

-- ============================================
-- 1. Delete Test Intake Form Submissions
-- ============================================
DELETE FROM "IntakeFormSubmission" 
WHERE "patientEmail" ILIKE '%test%'
   OR "patientEmail" ILIKE '%demo%'
   OR "patientEmail" ILIKE '%example.com%'
   OR "patientEmail" ILIKE '%fake%'
   OR "patientEmail" ILIKE '%sample%';

-- ============================================
-- 2. Delete Test SOAP Notes
-- ============================================
DELETE FROM "SOAPNote" 
WHERE "patientId" IN (
    SELECT id FROM "Patient" 
    WHERE email ILIKE '%test%'
       OR email ILIKE '%demo%'
       OR email ILIKE '%example.com%'
       OR "firstName" ILIKE '%test%'
       OR "firstName" ILIKE '%demo%'
       OR "lastName" ILIKE '%test%'
);

-- ============================================
-- 3. Delete Test Prescriptions
-- ============================================
DELETE FROM "Prescription" 
WHERE "patientId" IN (
    SELECT id FROM "Patient" 
    WHERE email ILIKE '%test%'
       OR email ILIKE '%demo%'
       OR email ILIKE '%example.com%'
);

-- ============================================
-- 4. Delete Test Orders
-- ============================================
DELETE FROM "Order" 
WHERE "patientId" IN (
    SELECT id FROM "Patient" 
    WHERE email ILIKE '%test%'
       OR email ILIKE '%demo%'
       OR email ILIKE '%example.com%'
);

-- ============================================
-- 5. Delete Test Invoices
-- ============================================
DELETE FROM "Invoice" 
WHERE "patientId" IN (
    SELECT id FROM "Patient" 
    WHERE email ILIKE '%test%'
       OR email ILIKE '%demo%'
       OR email ILIKE '%example.com%'
);

-- ============================================
-- 6. Delete Test Patient Documents
-- ============================================
DELETE FROM "PatientDocument" 
WHERE "patientId" IN (
    SELECT id FROM "Patient" 
    WHERE email ILIKE '%test%'
       OR email ILIKE '%demo%'
       OR email ILIKE '%example.com%'
);

-- ============================================
-- 7. Delete Test Appointments
-- ============================================
DELETE FROM "Appointment" 
WHERE "patientId" IN (
    SELECT id FROM "Patient" 
    WHERE email ILIKE '%test%'
       OR email ILIKE '%demo%'
       OR email ILIKE '%example.com%'
);

-- ============================================
-- 8. Delete Test Patient Audit Logs
-- ============================================
DELETE FROM "PatientAudit" 
WHERE "patientId" IN (
    SELECT id FROM "Patient" 
    WHERE email ILIKE '%test%'
       OR email ILIKE '%demo%'
       OR email ILIKE '%example.com%'
);

-- ============================================
-- 9. Delete Test Patients
-- ============================================
DELETE FROM "Patient" 
WHERE email ILIKE '%test%'
   OR email ILIKE '%demo%'
   OR email ILIKE '%example.com%'
   OR email ILIKE '%fake%'
   OR email ILIKE '%sample%'
   OR "firstName" ILIKE '%test%'
   OR "firstName" ILIKE '%demo%'
   OR "lastName" ILIKE '%test%'
   OR "lastName" ILIKE '%demo%';

-- ============================================
-- 10. Delete Test Provider Users
-- ============================================
DELETE FROM "User" 
WHERE email ILIKE '%test%'
   OR email ILIKE '%demo%'
   OR email ILIKE '%example.com%'
   OR email ILIKE '%fake%'
   OR email ILIKE '%sample%'
   OR email = 'admin@lifefile.com'
   OR email = 'provider@lifefile.com';

-- Keep the main admin
-- (Will be reset separately)

-- ============================================
-- 11. Delete Test Providers
-- ============================================
DELETE FROM "Provider" 
WHERE email ILIKE '%test%'
   OR email ILIKE '%demo%'
   OR email ILIKE '%example.com%'
   OR email ILIKE '%fake%'
   OR email = 'provider@lifefile.com'
   OR "firstName" ILIKE '%test%'
   OR "firstName" ILIKE '%demo%';

-- ============================================
-- 12. Clean up orphaned records
-- ============================================

-- Delete orders with no patient
DELETE FROM "Order" WHERE "patientId" IS NULL;

-- Delete invoices with no patient
DELETE FROM "Invoice" WHERE "patientId" IS NULL;

-- Delete SOAP notes with no patient
DELETE FROM "SOAPNote" WHERE "patientId" IS NULL;

-- ============================================
-- 13. Reset sequences if needed
-- ============================================
-- (Optional - uncomment if you want to reset IDs)
-- SELECT setval('"Patient_id_seq"', COALESCE((SELECT MAX(id) FROM "Patient"), 1));
-- SELECT setval('"Provider_id_seq"', COALESCE((SELECT MAX(id) FROM "Provider"), 1));
-- SELECT setval('"Order_id_seq"', COALESCE((SELECT MAX(id) FROM "Order"), 1));

-- ============================================
-- Verify cleanup
-- ============================================
SELECT 'Patients remaining' as table_name, COUNT(*) as count FROM "Patient"
UNION ALL
SELECT 'Providers remaining', COUNT(*) FROM "Provider"
UNION ALL
SELECT 'Orders remaining', COUNT(*) FROM "Order"
UNION ALL
SELECT 'Users remaining', COUNT(*) FROM "User"
UNION ALL
SELECT 'Intake submissions remaining', COUNT(*) FROM "IntakeFormSubmission";

COMMIT;

-- ============================================
-- Output success message
-- ============================================
SELECT '✅ Test data cleanup complete!' as status;
