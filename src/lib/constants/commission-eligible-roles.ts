export const COMMISSION_ELIGIBLE_ROLES = [
  'ADMIN',
  'PROVIDER',
  'STAFF',
  'SUPPORT',
  'SALES_REP',
  'PHARMACY_REP',
] as const;

export type CommissionEligibleRole = (typeof COMMISSION_ELIGIBLE_ROLES)[number];
