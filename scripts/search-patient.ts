/**
 * One-off script to search for a patient by name/email/phone/patientId.
 * Use to check if someone exists in the DB (e.g. "Alexis Atkins" on eonmeds).
 *
 * Usage:
 *   npx tsx scripts/search-patient.ts "alexis atkins"
 *   npx tsx scripts/search-patient.ts "alexis atkins" --clinic eonmeds
 *   npx tsx scripts/search-patient.ts "alexis atkins" --clinic eonmeds --show-phi
 *
 * Requires: DATABASE_URL, and PHI_ENCRYPTION_KEY if you use --show-phi or have unindexed patients.
 * For production DB, load env first, e.g.:
 *   env $(grep -v '^#' .env.production.local | xargs) npx tsx scripts/search-patient.ts "alexis atkins" --clinic eonmeds
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function splitSearchTerms(search: string): string[] {
  return search
    .trim()
    .split(/\s+/)
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean);
}

function buildSearchWhere(search: string) {
  const terms = splitSearchTerms(search);
  if (terms.length === 0) return {};
  return {
    AND: terms.map((term) => ({
      OR: [
        { searchIndex: { contains: term, mode: 'insensitive' as const } },
        { patientId: { contains: term, mode: 'insensitive' as const } },
      ],
    })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const showPhi = args.includes('--show-phi');
  const clinicIdx = args.indexOf('--clinic');
  const clinicSubdomain = clinicIdx >= 0 ? args[clinicIdx + 1] : null;
  const searchArg = args.find((a) => !a.startsWith('--') && a !== clinicSubdomain);
  const search = (searchArg || '').trim();

  if (!search) {
    console.error('Usage: npx tsx scripts/search-patient.ts "<search>" [--clinic subdomain] [--show-phi]');
    process.exit(1);
  }

  let clinicId: number | undefined;
  if (clinicSubdomain) {
    const clinic = await prisma.clinic.findUnique({
      where: { subdomain: clinicSubdomain },
      select: { id: true, name: true, subdomain: true },
    });
    if (!clinic) {
      console.error(`Clinic with subdomain "${clinicSubdomain}" not found.`);
      process.exit(1);
    }
    clinicId = clinic.id;
    console.error(`Clinic: ${clinic.name} (subdomain: ${clinic.subdomain}, id: ${clinic.id})`);
  }

  const baseWhere: Record<string, unknown> = clinicId ? { clinicId } : {};
  const searchFilter = buildSearchWhere(search);
  const whereIndexed = {
    ...baseWhere,
    ...searchFilter,
  };

  // Phase 1: indexed patients
  const indexed = await prisma.patient.findMany({
    where: whereIndexed,
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      email: true,
      searchIndex: true,
      clinicId: true,
      clinic: { select: { subdomain: true, name: true } },
    },
    take: 50,
  });

  // Phase 2: fallback for NULL searchIndex
  const terms = splitSearchTerms(search);
  const searchLower = search.toLowerCase();
  const searchDigits = search.replace(/\D/g, '');
  let fallback: typeof indexed = [];
  const unindexed = await prisma.patient.findMany({
    where: {
      ...baseWhere,
      OR: [{ searchIndex: null }, { searchIndex: '' }],
    },
    select: {
      id: true,
      patientId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      searchIndex: true,
      clinicId: true,
      clinic: { select: { subdomain: true, name: true } },
    },
    take: 2000,
  });

  if (unindexed.length > 0 && terms.length > 0) {
    try {
      const { decryptPHI } = await import('../src/lib/security/phi-encryption');
      const safeDecrypt = (v: string | null) => {
        if (!v) return '';
        try {
          const parts = v.split(':');
          if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p))) return decryptPHI(v);
        } catch {}
        return v;
      };
      fallback = unindexed.filter((p) => {
        const fn = safeDecrypt(p.firstName)?.toLowerCase() || '';
        const ln = safeDecrypt(p.lastName)?.toLowerCase() || '';
        const em = safeDecrypt(p.email)?.toLowerCase() || '';
        const ph = (safeDecrypt(p.phone) || '').replace(/\D/g, '');
        const pid = (p.patientId || '').toLowerCase();
        if (terms.length === 1) {
          const t = terms[0];
          return fn.includes(t) || ln.includes(t) || em.includes(t) || pid.includes(t) || (searchDigits.length >= 3 && ph.includes(searchDigits));
        }
        const fullName = `${fn} ${ln}`;
        if (fullName.includes(searchLower)) return true;
        return terms.every((t) => fn.includes(t) || ln.includes(t) || pid.includes(t) || em.includes(t));
      });
    } catch (e) {
      console.error('(Fallback decrypt skipped:', String(e), ')');
    }
  }

  const seen = new Set(indexed.map((p) => p.id));
  const combined = [...indexed, ...fallback.filter((p) => !seen.has(p.id))];

  console.log(JSON.stringify({ search, clinic: clinicSubdomain || 'all', count: combined.length }, null, 2));
  for (const p of combined) {
    const row: Record<string, unknown> = {
      id: p.id,
      patientId: p.patientId,
      clinic: p.clinic?.subdomain ?? p.clinicId,
    };
    if (showPhi) {
      try {
        const { decryptPHI } = await import('../src/lib/security/phi-encryption');
        const safeDecrypt = (v: string | null) => {
          if (!v) return null;
          try {
            const parts = v.split(':');
            if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p))) return decryptPHI(v);
          } catch {}
          return v;
        };
        row.firstName = safeDecrypt(p.firstName);
        row.lastName = safeDecrypt(p.lastName);
        row.email = safeDecrypt(p.email);
      } catch {}
    }
    console.log(JSON.stringify(row));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
