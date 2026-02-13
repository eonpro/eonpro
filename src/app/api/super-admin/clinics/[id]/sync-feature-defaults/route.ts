/**
 * Sync Default Features to Clinic
 * ===============================
 *
 * POST /api/super-admin/clinics/[id]/sync-feature-defaults
 * Super-admin only. Merges DEFAULT_CLINIC_FEATURES into clinic.features.
 * Adds missing keys only; does NOT overwrite explicit false (preserves intentional disable).
 *
 * Use when a clinic is missing a feature flag that should default ON.
 * @see docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withSuperAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { DEFAULT_CLINIC_FEATURES } from '@/lib/clinic/feature-defaults';

async function handler(req: NextRequest, user: AuthUser) {
  const match = req.nextUrl.pathname.match(/\/clinics\/(\d+)\/sync-feature-defaults/);
  const clinicId = match ? parseInt(match[1], 10) : NaN;
  if (isNaN(clinicId) || clinicId <= 0) {
    return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, subdomain: true, features: true },
  });

  if (!clinic) {
    return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
  }

  const current = (clinic.features as Record<string, unknown>) || {};
  const merged: Record<string, unknown> = { ...current };
  let changed = false;

  for (const [key, defaultValue] of Object.entries(DEFAULT_CLINIC_FEATURES)) {
    if (current[key] === undefined) {
      merged[key] = defaultValue;
      changed = true;
    }
  }

  if (!changed) {
    return NextResponse.json({
      message: 'No missing defaults to sync',
      clinicId,
      name: clinic.name,
      updated: false,
    });
  }

  try {
    const [row] = await prisma.$queryRaw<Array<{ pg_is_in_recovery: boolean }>>`SELECT pg_is_in_recovery()`;
    if (row?.pg_is_in_recovery) {
      logger.warn('[SyncFeatureDefaults] Writing to read replica - feature update may not propagate', {
        clinicId,
        clinicName: clinic.name,
      });
    }
  } catch {
    // Non-Postgres or query failed; proceed with update
  }

  await prisma.clinic.update({
    where: { id: clinicId },
    data: { features: merged },
  });

  logger.info('[SyncFeatureDefaults] Merged missing defaults', {
    clinicId,
    clinicName: clinic.name,
    keysAdded: Object.keys(DEFAULT_CLINIC_FEATURES).filter((k) => current[k] === undefined),
  });

  return NextResponse.json({
    message: 'Default features synced',
    clinicId,
    name: clinic.name,
    updated: true,
    keysAdded: Object.keys(DEFAULT_CLINIC_FEATURES).filter((k) => current[k] === undefined),
  });
}

export const POST = withSuperAdminAuth(handler);
