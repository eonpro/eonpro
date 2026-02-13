-- Tenant Uniformity: Ensure BLOODWORK_LABS defaults ON for all ACTIVE clinics
-- Fixes Labs tab missing on ot.eonpro.io (clinic 8) when features had explicit false.
-- Only updates when BLOODWORK_LABS is explicitly false; preserves intentional disabled state
-- is handled by NOT overwriting - we SET to true to enforce uniformity per diagnosis.
--
-- Per docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md

UPDATE "Clinic"
SET features = jsonb_set(
  COALESCE(features::jsonb, '{}'::jsonb),
  '{BLOODWORK_LABS}',
  'true'::jsonb
)
WHERE status = 'ACTIVE'
  AND (
    features->>'BLOODWORK_LABS' IS NULL
    OR (features->>'BLOODWORK_LABS')::boolean = false
  );
