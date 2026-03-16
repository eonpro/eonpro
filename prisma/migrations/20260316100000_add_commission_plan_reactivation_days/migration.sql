-- AlterTable: Add reactivation window to commission plans.
-- When set, a patient whose last payment was more than reactivationDays ago
-- is treated as a "new sale" for commission purposes (resets FIRST_PAYMENT_ONLY eligibility).
ALTER TABLE "SalesRepCommissionPlan" ADD COLUMN "reactivationDays" INTEGER;
