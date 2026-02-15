import { prisma } from '@/lib/db';

/**
 * Check if a user has access to a specific patient's data with clinic isolation.
 *
 * Authorization rules:
 * - Patients: must own the data (patientId match)
 * - Providers/admins/staff: must verify patient belongs to their clinic
 * - Super admins: can access any patient
 * - All other roles: denied
 */
export async function canAccessPatientWithClinic(
  user: { role: string; patientId?: number; clinicId?: number | null },
  patientId: number
): Promise<boolean> {
  if (user.role === 'patient') {
    return user.patientId === patientId;
  }
  if (user.role === 'super_admin') {
    return true;
  }
  if (!['provider', 'admin', 'staff'].includes(user.role)) {
    return false;
  }
  if (!user.clinicId) return false;
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId },
    select: { id: true },
  });
  return !!patient;
}
