/**
 * Patient portal base path for white-label separation.
 * eonmeds.eonpro.io/portal, wellmedr.eonpro.io/portal, eonpro.io/portal, etc.
 */
export const PATIENT_PORTAL_PATH =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_PATIENT_PORTAL_PATH) || '/portal';
