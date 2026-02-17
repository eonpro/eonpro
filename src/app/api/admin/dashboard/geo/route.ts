/**
 * Admin Dashboard Geographic Data API
 * ====================================
 *
 * Returns patient/intake counts grouped by US state and clinic,
 * including each clinic's brand color for map visualization.
 *
 * @module api/admin/dashboard/geo
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';

interface ClinicBreakdown {
  clinicId: number;
  clinicName: string;
  color: string;
  count: number;
}

interface StateData {
  total: number;
  clinics: ClinicBreakdown[];
}

export interface GeoPayload {
  stateData: Record<string, StateData>;
  clinics: Array<{
    id: number;
    name: string;
    color: string;
    totalPatients: number;
  }>;
}

async function handleGet(req: NextRequest, user: AuthUser) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  try {
    const isSuperAdmin = user.role === 'super_admin';
    const clinicId = isSuperAdmin ? undefined : (user.clinicId ?? undefined);

    const clinicFilter = clinicId ? { clinicId } : {};

    // PERF FIX: Use groupBy to aggregate at database level instead of loading all patients
    // into memory. Returns only unique (state, clinicId, count) rows — orders of magnitude
    // smaller than the full patient table.
    const grouped = await prisma.patient.groupBy({
      by: ['state', 'clinicId'],
      where: {
        ...clinicFilter,
        state: { not: '' },
      },
      _count: { _all: true },
    });

    // Fetch clinic info for color mapping
    const clinicIds = [...new Set(grouped.map((g) => g.clinicId))];
    const clinics = await prisma.clinic.findMany({
      where: { id: { in: clinicIds } },
      select: {
        id: true,
        name: true,
        primaryColor: true,
      },
    });

    const clinicMap = new Map(
      clinics.map((c) => [c.id, { name: c.name, color: c.primaryColor ?? '#3B82F6' }])
    );

    // Build stateData from grouped results (small set — only unique state+clinic combos)
    const stateData: Record<string, StateData> = {};
    const clinicTotals = new Map<number, number>();

    for (const row of grouped) {
      const stateCode = normalizeStateCode(row.state ?? '');
      if (!stateCode) continue;

      const count = row._count._all;

      if (!stateData[stateCode]) {
        stateData[stateCode] = { total: 0, clinics: [] };
      }
      stateData[stateCode].total += count;

      // Track per-clinic within state
      const clinicInfo = clinicMap.get(row.clinicId);
      const existing = stateData[stateCode].clinics.find(
        (c) => c.clinicId === row.clinicId
      );
      if (existing) {
        existing.count += count;
      } else {
        stateData[stateCode].clinics.push({
          clinicId: row.clinicId,
          clinicName: clinicInfo?.name ?? 'Unknown',
          color: clinicInfo?.color ?? '#3B82F6',
          count,
        });
      }

      clinicTotals.set(
        row.clinicId,
        (clinicTotals.get(row.clinicId) ?? 0) + count
      );
    }

    // Sort clinics within each state by count descending
    for (const state of Object.values(stateData)) {
      state.clinics.sort((a, b) => b.count - a.count);
    }

    const clinicsSummary = clinicIds
      .map((id) => ({
        id,
        name: clinicMap.get(id)?.name ?? 'Unknown',
        color: clinicMap.get(id)?.color ?? '#3B82F6',
        totalPatients: clinicTotals.get(id) ?? 0,
      }))
      .sort((a, b) => b.totalPatients - a.totalPatients);

    const payload: GeoPayload = { stateData, clinics: clinicsSummary };

    logger.info('[ADMIN-DASHBOARD-GEO] Fetched', {
      userId: user.id,
      clinicId: user.clinicId,
      statesWithData: Object.keys(stateData).length,
      requestId,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError(error, {
      requestId,
      route: 'GET /api/admin/dashboard/geo',
      context: { userId: user.id, clinicId: user.clinicId },
    });
  }
}

/**
 * Normalize state input to 2-letter US state code.
 * Handles full names, abbreviations, and common variations.
 */
function normalizeStateCode(input: string): string | null {
  if (!input) return null;
  const cleaned = input.trim().toUpperCase();

  // Already a valid 2-letter code
  if (cleaned.length === 2 && STATE_CODES.has(cleaned)) {
    return cleaned;
  }

  // Try full name lookup
  return STATE_NAME_MAP.get(cleaned) ?? null;
}

const STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC',
]);

const STATE_NAME_MAP = new Map<string, string>([
  ['ALABAMA', 'AL'], ['ALASKA', 'AK'], ['ARIZONA', 'AZ'], ['ARKANSAS', 'AR'],
  ['CALIFORNIA', 'CA'], ['COLORADO', 'CO'], ['CONNECTICUT', 'CT'], ['DELAWARE', 'DE'],
  ['FLORIDA', 'FL'], ['GEORGIA', 'GA'], ['HAWAII', 'HI'], ['IDAHO', 'ID'],
  ['ILLINOIS', 'IL'], ['INDIANA', 'IN'], ['IOWA', 'IA'], ['KANSAS', 'KS'],
  ['KENTUCKY', 'KY'], ['LOUISIANA', 'LA'], ['MAINE', 'ME'], ['MARYLAND', 'MD'],
  ['MASSACHUSETTS', 'MA'], ['MICHIGAN', 'MI'], ['MINNESOTA', 'MN'], ['MISSISSIPPI', 'MS'],
  ['MISSOURI', 'MO'], ['MONTANA', 'MT'], ['NEBRASKA', 'NE'], ['NEVADA', 'NV'],
  ['NEW HAMPSHIRE', 'NH'], ['NEW JERSEY', 'NJ'], ['NEW MEXICO', 'NM'], ['NEW YORK', 'NY'],
  ['NORTH CAROLINA', 'NC'], ['NORTH DAKOTA', 'ND'], ['OHIO', 'OH'], ['OKLAHOMA', 'OK'],
  ['OREGON', 'OR'], ['PENNSYLVANIA', 'PA'], ['RHODE ISLAND', 'RI'], ['SOUTH CAROLINA', 'SC'],
  ['SOUTH DAKOTA', 'SD'], ['TENNESSEE', 'TN'], ['TEXAS', 'TX'], ['UTAH', 'UT'],
  ['VERMONT', 'VT'], ['VIRGINIA', 'VA'], ['WASHINGTON', 'WA'], ['WEST VIRGINIA', 'WV'],
  ['WISCONSIN', 'WI'], ['WYOMING', 'WY'], ['DISTRICT OF COLUMBIA', 'DC'],
]);

export const GET = withAdminAuth(handleGet);
