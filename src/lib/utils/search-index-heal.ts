/**
 * Search Index Self-Healing (server-only)
 *
 * Separated from search.ts because it imports phi-encryption which depends
 * on Node.js `crypto`. Keeping it here prevents webpack from pulling crypto
 * into client/edge bundles when search.ts is imported.
 *
 * @module lib/utils/search-index-heal
 */

import { decryptPHI } from '@/lib/security/phi-encryption';
import { buildPatientSearchIndex } from './search';

/**
 * Read a patient, decrypt PHI, rebuild searchIndex if incomplete, and persist.
 *
 * Designed to be called fire-and-forget from any context (Prisma middleware,
 * background job, etc.). Safe to call repeatedly — no-ops when the index is
 * already complete.
 *
 * @param db  Any PrismaClient instance (base or tenant-scoped)
 * @param patientId  The numeric `id` of the patient to heal
 */
export async function healPatientSearchIndex(
  db: { patient: { findUnique: Function; update: Function } },
  patientId: number,
): Promise<void> {
  try {
    const patient = await db.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        searchIndex: true,
      },
    });

    if (!patient) return;

    const safeDecrypt = (v: unknown): string => {
      if (v == null || v === '') return '';
      try {
        const s = String(v);
        const parts = s.split(':');
        if (parts.length === 3 && parts.every((p: string) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
          return decryptPHI(s) ?? '';
        }
        return s;
      } catch {
        return '';
      }
    };

    const fn = safeDecrypt(patient.firstName);
    const ln = safeDecrypt(patient.lastName);
    const em = safeDecrypt(patient.email);
    const ph = safeDecrypt(patient.phone);

    const newIndex = buildPatientSearchIndex({
      firstName: fn || null,
      lastName: ln || null,
      email: em || null,
      phone: ph || null,
      patientId: patient.patientId || null,
    });

    if (!newIndex) return;
    if (newIndex === patient.searchIndex) return;

    await db.patient.update({
      where: { id: patientId },
      data: { searchIndex: newIndex },
    });
  } catch {
    // Swallow — callers handle logging; this must never throw.
  }
}
