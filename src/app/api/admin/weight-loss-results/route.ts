import { NextRequest, NextResponse } from 'next/server';
import { prisma, basePrisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';
import { decryptPHI } from '@/lib/security/phi-encryption';

interface WeightAggRow {
  patientId: number;
  start_weight: number;
  current_weight: number;
  first_log_date: Date;
  last_log_date: Date;
  log_count: bigint;
}

const VALID_PERIODS = ['30d', '90d', '180d', '365d', 'all'] as const;
type Period = (typeof VALID_PERIODS)[number];

const VALID_SORTS = ['rate', 'total'] as const;
type SortMode = (typeof VALID_SORTS)[number];

const PERIOD_DAYS: Record<Period, number | null> = {
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '365d': 365,
  all: null,
};

const AVG_DAYS_PER_MONTH = 30.44;
const MIN_TRACKING_DAYS = 7;

export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      if (!user.clinicId) {
        return NextResponse.json(
          { error: 'User is not associated with a clinic' },
          { status: 400 }
        );
      }

      const clinicId = user.clinicId;
      const url = new URL(request.url);

      const period = (url.searchParams.get('period') || '90d') as Period;
      if (!VALID_PERIODS.includes(period)) {
        return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
      }

      const sortMode = (url.searchParams.get('sort') || 'rate') as SortMode;
      if (!VALID_SORTS.includes(sortMode)) {
        return NextResponse.json({ error: 'Invalid sort' }, { status: 400 });
      }

      const limitParam = parseInt(url.searchParams.get('limit') || '25', 10);
      const limit = Math.min(Math.max(1, limitParam), 100);

      return await runWithClinicContext(clinicId, async () => {
        try {
          const periodDays = PERIOD_DAYS[period];
          const dateFilter = periodDays
            ? Prisma.sql`AND pwl."recordedAt" >= NOW() - INTERVAL '${Prisma.raw(String(periodDays))} days'`
            : Prisma.empty;

          const rows = await basePrisma.$queryRaw<WeightAggRow[]>(Prisma.sql`
            WITH ranked AS (
              SELECT
                pwl."patientId",
                pwl.weight,
                pwl."recordedAt",
                ROW_NUMBER() OVER (PARTITION BY pwl."patientId" ORDER BY pwl."recordedAt" ASC) AS rn_first,
                ROW_NUMBER() OVER (PARTITION BY pwl."patientId" ORDER BY pwl."recordedAt" DESC) AS rn_last,
                COUNT(*) OVER (PARTITION BY pwl."patientId") AS log_count
              FROM "PatientWeightLog" pwl
              JOIN "Patient" p ON p.id = pwl."patientId"
              WHERE p."clinicId" = ${clinicId}
                ${dateFilter}
            )
            SELECT
              "patientId",
              MAX(CASE WHEN rn_first = 1 THEN weight END)::double precision AS start_weight,
              MAX(CASE WHEN rn_last = 1 THEN weight END)::double precision AS current_weight,
              MAX(CASE WHEN rn_first = 1 THEN "recordedAt" END) AS first_log_date,
              MAX(CASE WHEN rn_last = 1 THEN "recordedAt" END) AS last_log_date,
              MAX(log_count) AS log_count
            FROM ranked
            WHERE rn_first = 1 OR rn_last = 1
            GROUP BY "patientId"
            HAVING MAX(log_count) >= 2
          `);

          const computed = rows
            .map((row) => {
              const totalLost = Number(row.start_weight) - Number(row.current_weight);
              const durationMs =
                new Date(row.last_log_date).getTime() - new Date(row.first_log_date).getTime();
              const durationDays = durationMs / (1000 * 60 * 60 * 24);
              const months = durationDays / AVG_DAYS_PER_MONTH;
              const lbsPerMonth = months > 0 ? totalLost / months : 0;

              return {
                patientId: Number(row.patientId),
                startWeight: Math.round(Number(row.start_weight) * 10) / 10,
                currentWeight: Math.round(Number(row.current_weight) * 10) / 10,
                totalLost: Math.round(totalLost * 10) / 10,
                durationDays: Math.round(durationDays),
                lbsPerMonth: Math.round(lbsPerMonth * 100) / 100,
                firstLogDate: row.first_log_date,
                lastLogDate: row.last_log_date,
                logCount: Number(row.log_count),
              };
            })
            .filter((r) => r.totalLost > 0 && r.durationDays >= MIN_TRACKING_DAYS);

          computed.sort((a, b) =>
            sortMode === 'rate' ? b.lbsPerMonth - a.lbsPerMonth : b.totalLost - a.totalLost
          );

          const topResults = computed.slice(0, limit);

          const patientIds = topResults.map((r) => r.patientId);
          const patients =
            patientIds.length > 0
              ? await prisma.patient.findMany({
                  where: { id: { in: patientIds } },
                  select: { id: true, firstName: true, lastName: true },
                })
              : [];

          const nameMap = new Map<number, { firstName: string; lastName: string }>();
          for (const p of patients) {
            nameMap.set(p.id, {
              firstName: decryptPHI(p.firstName) || 'Unknown',
              lastName: decryptPHI(p.lastName) || '',
            });
          }

          const results = topResults.map((r) => {
            const name = nameMap.get(r.patientId);
            return {
              ...r,
              firstName: name?.firstName ?? 'Unknown',
              lastName: name?.lastName ?? '',
            };
          });

          const patientsWithLoss = computed.length;
          const avgLbsLost =
            patientsWithLoss > 0
              ? Math.round(
                  (computed.reduce((s, r) => s + r.totalLost, 0) / patientsWithLoss) * 10
                ) / 10
              : 0;
          const avgLbsPerMonth =
            patientsWithLoss > 0
              ? Math.round(
                  (computed.reduce((s, r) => s + r.lbsPerMonth, 0) / patientsWithLoss) * 100
                ) / 100
              : 0;
          const topLbsLost =
            computed.length > 0 ? Math.max(...computed.map((r) => r.totalLost)) : 0;
          const totalLbsLost = Math.round(computed.reduce((s, r) => s + r.totalLost, 0) * 10) / 10;

          return NextResponse.json({
            results,
            summary: {
              totalPatientsTracked: rows.length,
              patientsWithLoss,
              avgLbsLost,
              avgLbsPerMonth,
              topLbsLost,
              totalLbsLost,
            },
          });
        } catch (innerError) {
          logger.error('Error inside weight-loss-results context:', {
            error: innerError instanceof Error ? innerError.message : String(innerError),
            userId: user.id,
            clinicId: user.clinicId,
          });
          throw innerError;
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error fetching weight-loss results:', {
        error: message,
        userId: user.id,
        clinicId: user.clinicId,
      });
      return NextResponse.json({ error: 'Failed to fetch weight loss results' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin', 'provider'] }
);
