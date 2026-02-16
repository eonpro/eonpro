/**
 * Canonical display format for patient IDs across all UI surfaces.
 *
 * Priority:
 *   1. patient.patientId (clinic-scoped, e.g. "WEL-78890922")
 *   2. Padded database id as fallback (e.g. "025613")
 *
 * @param patientId  - The clinic-scoped patientId string (nullable)
 * @param id         - The database primary key (number)
 * @returns Formatted display string (without leading "#")
 */
export function formatPatientDisplayId(
  patientId: string | null | undefined,
  id: number | string,
): string {
  if (patientId) return patientId;
  return String(id).padStart(6, '0');
}
