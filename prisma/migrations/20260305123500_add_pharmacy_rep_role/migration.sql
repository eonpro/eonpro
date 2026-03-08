DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole'
      AND e.enumlabel = 'PHARMACY_REP'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'PHARMACY_REP';
  END IF;
END
$$;
