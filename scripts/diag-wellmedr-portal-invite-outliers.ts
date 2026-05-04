#!/usr/bin/env tsx
/**
 * Read-only diagnostic for WellMedR patients flagged by
 * `verify-wellmedr-portal-invite-coverage.ts` as paid-but-uninvited.
 *
 * For each patient id passed in, prints:
 *  - Whether they have a User row (i.e. portal account)
 *  - Whether they have ANY PatientPortalInvite rows
 *  - Their PAID invoices (id, amount, paidAt, source/metadata.source)
 *  - Whether they have a usable email and phone (decrypted)
 *  - The most likely reason the invite never fired (best-effort heuristic)
 *
 * Usage:
 *   npx tsx scripts/diag-wellmedr-portal-invite-outliers.ts <patientId> [<patientId> ...]
 */

import { basePrisma as prisma } from '../src/lib/db';
import {
  decryptPatientPHI,
  DEFAULT_PHI_FIELDS,
} from '../src/lib/security/phi-encryption';

async function main() {
  const ids = process.argv
    .slice(2)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (ids.length === 0) {
    console.error('Usage: tsx scripts/diag-wellmedr-portal-invite-outliers.ts <patientId> ...');
    process.exit(1);
  }

  for (const patientId of ids) {
    console.log(`\n=== Patient ${patientId} ===`);
    const p = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        user: { select: { id: true, createdAt: true } },
        clinic: { select: { id: true, subdomain: true } },
        invoices: {
          where: { status: 'PAID' },
          select: {
            id: true,
            amount: true,
            paidAt: true,
            createdAt: true,
            metadata: true,
          },
          orderBy: { paidAt: 'desc' },
          take: 5,
        },
        portalInvites: {
          select: {
            id: true,
            trigger: true,
            createdAt: true,
            expiresAt: true,
            usedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!p) {
      console.log(`  NOT FOUND`);
      continue;
    }

    console.log(`  clinicId       : ${p.clinic?.id} (${p.clinic?.subdomain})`);
    console.log(`  hasUser        : ${!!p.user}${p.user ? ` (userId=${p.user.id}, created=${p.user.createdAt.toISOString()})` : ''}`);
    console.log(`  totalInvites   : ${p.portalInvites.length}`);
    if (p.portalInvites.length > 0) {
      for (const inv of p.portalInvites) {
        console.log(
          `    - id=${inv.id} trigger=${inv.trigger} created=${inv.createdAt.toISOString()} expires=${inv.expiresAt.toISOString()} used=${inv.usedAt?.toISOString() ?? '-'}`
        );
      }
    }

    let dec: { email?: unknown; phone?: unknown; firstName?: unknown; lastName?: unknown } = {};
    try {
      dec = decryptPatientPHI(p as unknown as Record<string, unknown>, [
        ...DEFAULT_PHI_FIELDS,
      ]) as any;
    } catch (err) {
      console.log(
        `  PHI decrypt    : FAILED (${err instanceof Error ? err.message : 'Unknown'})`
      );
    }

    const email = String(dec.email ?? '').trim().toLowerCase();
    const phone = String(dec.phone ?? '').trim();
    const placeholderPhone = phone === '0000000000' || phone === '+10000000000';
    console.log(`  hasEmail       : ${!!email}${email ? ` (${maskEmail(email)})` : ''}`);
    console.log(
      `  hasPhone       : ${!!phone}${phone ? ` (${maskPhone(phone)})${placeholderPhone ? ' [PLACEHOLDER]' : ''}` : ''}`
    );

    console.log(`  paidInvoices(5):`);
    for (const inv of p.invoices) {
      const meta = (inv.metadata as Record<string, unknown> | null) ?? {};
      console.log(
        `    - id=${inv.id} amount=$${(inv.amount / 100).toFixed(2)} paidAt=${inv.paidAt?.toISOString() ?? '-'} source=${meta.source ?? '-'} paymentMethod=${meta.paymentMethod ?? '-'}`
      );
    }

    // Heuristic diagnosis
    console.log(`  diagnosis      :`);
    if (p.portalInvites.length > 0) {
      console.log(`    Patient HAS invite(s); script may have classified incorrectly.`);
    } else if (p.user) {
      console.log(`    Patient already has portal account — invite path is N/A.`);
    } else if (!email && !phone) {
      console.log(
        `    BENIGN: no email AND no phone → triggerPortalInviteOnPayment correctly skipped.`
      );
    } else if (placeholderPhone && !email) {
      console.log(
        `    BENIGN: only placeholder phone, no email → can't deliver. Patient profile needs update.`
      );
    } else {
      // Has contact info, no portal account, no invite — REGRESSION suspect.
      const newestPaid = p.invoices[0]?.paidAt;
      if (newestPaid && Date.now() - newestPaid.getTime() < 5 * 60 * 1000) {
        console.log(
          `    LIKELY: payment is < 5min old; trigger may still be in flight. Re-check later.`
        );
      } else {
        const sources = new Set(
          p.invoices
            .map((i) => (i.metadata as Record<string, unknown> | null)?.source as string)
            .filter(Boolean)
        );
        console.log(
          `    SUSPECT REGRESSION: has contact info but no invite. Invoice sources: [${[...sources].join(', ')}]`
        );
        console.log(
          `    Action: replay invite via API or backfill script. Investigate the source's invite-trigger wiring.`
        );
      }
    }
  }
}

function maskEmail(e: string): string {
  const [local, domain] = e.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}
function maskPhone(p: string): string {
  return `***${p.slice(-4)}`;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
