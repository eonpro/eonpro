-- Multi-Tenant RLS Audit Policies
--
-- Phase 1: LOG-ONLY mode. These policies use PERMISSIVE mode so they do NOT
-- block any queries. Instead, a trigger logs violations to a new audit table.
-- After 2 weeks of zero violations, graduate to RESTRICTIVE (enforcing) mode.
--
-- The application sets `app.clinic_id` via SET LOCAL at the start of each request.
-- When app.clinic_id is not set, the GUC returns '' which we coalesce to 0,
-- allowing the query to proceed (all clinic_id values are > 0, so no rows match
-- the "wrong" filter — this is the log-only safety net).

-- Table to record RLS audit violations (log-only mode)
CREATE TABLE IF NOT EXISTS "_RlsAuditLog" (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  row_clinic_id INTEGER,
  session_clinic_id INTEGER,
  current_user_name TEXT,
  query_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rls_audit_log_created_at ON "_RlsAuditLog" (created_at);

-- Function to log RLS violations (called by trigger, not by policy)
CREATE OR REPLACE FUNCTION _rls_audit_violation()
RETURNS TRIGGER AS $$
DECLARE
  session_cid INTEGER;
BEGIN
  BEGIN
    session_cid := current_setting('app.clinic_id', true)::INTEGER;
  EXCEPTION WHEN OTHERS THEN
    session_cid := NULL;
  END;

  -- Only log if there's a mismatch (session_cid is set AND differs from row clinicId)
  IF session_cid IS NOT NULL AND session_cid > 0 THEN
    IF (TG_OP = 'INSERT' AND NEW."clinicId" IS NOT NULL AND NEW."clinicId" != session_cid) OR
       (TG_OP = 'UPDATE' AND NEW."clinicId" IS NOT NULL AND NEW."clinicId" != session_cid) OR
       (TG_OP = 'DELETE' AND OLD."clinicId" IS NOT NULL AND OLD."clinicId" != session_cid) THEN

      INSERT INTO "_RlsAuditLog" (table_name, operation, row_clinic_id, session_clinic_id, current_user_name)
      VALUES (TG_TABLE_NAME, TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN OLD."clinicId" ELSE NEW."clinicId" END,
        session_cid,
        current_user);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to the highest-risk PHI tables.
-- These do NOT block queries — they only log violations.

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'Patient', 'Order', 'Invoice', 'Payment', 'Subscription',
    'PatientDocument', 'PatientPhoto', 'PatientChatMessage',
    'SmsLog', 'SOAPNote', 'Appointment', 'Ticket',
    'RefillQueue', 'LabReport', 'IntakeFormTemplate'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Drop existing trigger if present (idempotent)
    EXECUTE format('DROP TRIGGER IF EXISTS _rls_audit_trigger ON %I', tbl);

    -- Create the audit trigger
    EXECUTE format(
      'CREATE TRIGGER _rls_audit_trigger
       BEFORE INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION _rls_audit_violation()',
      tbl
    );
  END LOOP;
END;
$$;
