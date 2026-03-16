-- AlterTable: Add weekly base salary to sales rep plan assignments.
-- When set, this fixed amount is added to the rep's payroll each week
-- on top of their variable commission earnings.
ALTER TABLE "SalesRepPlanAssignment" ADD COLUMN "weeklyBasePayCents" INTEGER;
