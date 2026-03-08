/**
 * PRESCRIPTION REPORT SERVICE
 * ============================
 * Generates prescription reports for super-admin: prescriptions written
 * by providers per clinic with date-range filtering.
 *
 * Returns both summary (grouped by clinic -> provider) and detail
 * (individual prescription rows) views.
 *
 * @module services/reporting/prescriptionReportService
 */

import { prisma, withoutClinicFilter } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';

// ============================================================================
// Types
// ============================================================================

export type ReportPeriod =
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'semester'
  | 'year'
  | 'custom';

export interface PrescriptionReportFilters {
  period: ReportPeriod;
  startDate?: Date;
  endDate?: Date;
  clinicId?: number;
  providerId?: number;
  page?: number;
  limit?: number;
}

export interface ProviderRxSummary {
  providerId: number;
  providerName: string;
  clinicId: number;
  clinicName: string;
  prescriptionCount: number;
  uniquePatients: number;
}

export interface PrescriptionDetailRow {
  orderId: number;
  lifefileOrderId: string | null;
  date: string;
  patientId: number;
  patientName: string;
  providerId: number;
  providerName: string;
  clinicId: number;
  clinicName: string;
  medications: string;
  vialBreakdown: string[];
  status: string | null;
}

export interface PrescriptionReportResult {
  summary: {
    totalPrescriptions: number;
    uniquePatients: number;
    activeProviders: number;
    clinicCount: number;
    byProvider: ProviderRxSummary[];
  };
  details: PrescriptionDetailRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

// ============================================================================
// Date Helpers
// ============================================================================

function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return decryptPHI(value) ?? value;
  } catch {
    return value;
  }
}

function formatRxBreakdown(
  rxs: Array<{
    medName: string | null;
    strength: string | null;
    form: string | null;
    quantity: string | number | null;
  }>
): string[] {
  return rxs
    .map((rx, index) => {
      const medication = [rx.medName, rx.strength, rx.form].filter(Boolean).join(' ').trim() || 'Unknown medication';
      const quantityRaw = String(rx.quantity ?? '').trim();
      const quantity = quantityRaw ? ` - Qty ${quantityRaw}` : '';
      return `Vial ${index + 1}: ${medication}${quantity}`;
    })
    .filter(Boolean);
}

function toMedicationSummary(vialBreakdown: string[]): string {
  const summary = vialBreakdown.map((line) => line.replace(/^Vial \d+:\s*/, '')).join('; ');
  return summary || 'N/A';
}

interface ReportOrder {
  id: number;
  lifefileOrderId: string | null;
  createdAt: Date;
  patientId: number;
  providerId: number;
  clinicId: number | null;
  status: string | null;
  rxs: Array<{
    medName: string | null;
    strength: string | null;
    form: string | null;
    quantity: string | number | null;
  }>;
  patient: {
    id: number;
    firstName: string | null;
    lastName: string | null;
  };
  provider: {
    id: number;
    firstName: string | null;
    lastName: string | null;
  };
  clinic: {
    id: number;
    name: string;
  };
}

function mapOrderToDetail(order: ReportOrder): PrescriptionDetailRow {
  const patientName = `${safeDecrypt(order.patient.firstName)} ${safeDecrypt(order.patient.lastName)}`.trim();
  const providerName = `${order.provider.firstName ?? ''} ${order.provider.lastName ?? ''}`.trim();
  const vialBreakdown = formatRxBreakdown(order.rxs);

  return {
    orderId: order.id,
    lifefileOrderId: order.lifefileOrderId,
    date: order.createdAt.toISOString(),
    patientId: order.patient.id,
    patientName: patientName || 'Unknown',
    providerId: order.provider.id,
    providerName: providerName || 'Unknown',
    clinicId: order.clinic.id,
    clinicName: order.clinic.name,
    medications: toMedicationSummary(vialBreakdown),
    vialBreakdown,
    status: order.status,
  };
}

export function computeDateRange(
  period: ReportPeriod,
  customStart?: Date,
  customEnd?: Date
): { startDate: Date; endDate: Date } {
  const now = new Date();
  let startDate: Date;
  let endDate = new Date(now);

  switch (period) {
    case 'day': {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'week': {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'month': {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
    case 'quarter': {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), quarterStart, 1);
      break;
    }
    case 'semester': {
      const semesterStart = now.getMonth() < 6 ? 0 : 6;
      startDate = new Date(now.getFullYear(), semesterStart, 1);
      break;
    }
    case 'year': {
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    }
    case 'custom': {
      if (!customStart || !customEnd) {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
      } else {
        startDate = new Date(customStart);
        endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
      }
      break;
    }
    default: {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
    }
  }

  return { startDate, endDate };
}

// ============================================================================
// Service
// ============================================================================

export const prescriptionReportService = {
  /**
   * Fetch full prescription report: summary + paginated details.
   */
  async getReport(filters: PrescriptionReportFilters): Promise<PrescriptionReportResult> {
    const { clinicId, providerId, page = 1, limit = 50 } = filters;
    const { startDate, endDate } = computeDateRange(
      filters.period,
      filters.startDate,
      filters.endDate
    );
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {
      createdAt: { gte: startDate, lte: endDate },
    };
    if (clinicId) where.clinicId = clinicId;
    if (providerId) where.providerId = providerId;

    return withoutClinicFilter(async () => {
      const [orders, totalCount] = await Promise.all([
        prisma.order.findMany({
          where,
          select: {
            id: true,
            lifefileOrderId: true,
            createdAt: true,
            patientId: true,
            providerId: true,
            clinicId: true,
            status: true,
            rxs: {
              select: {
                medName: true,
                strength: true,
                form: true,
                quantity: true,
              },
            },
            patient: {
              select: { id: true, firstName: true, lastName: true },
            },
            provider: {
              select: { id: true, firstName: true, lastName: true },
            },
            clinic: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.order.count({ where }),
      ]);

      // Build detail rows with PHI decryption
      const details: PrescriptionDetailRow[] = orders.map((order) =>
        mapOrderToDetail(order as unknown as ReportOrder)
      );

      // Build summary via aggregate queries (across ALL orders in range, not just this page)
      const summaryAgg = await prisma.order.groupBy({
        by: ['providerId', 'clinicId'],
        where,
        _count: { id: true },
      });

      const uniquePatientResult = await prisma.order.findMany({
        where,
        select: { patientId: true },
        distinct: ['patientId'],
      });

      // Fetch provider + clinic names for summary rows
      const providerIds = [...new Set(summaryAgg.map((r) => r.providerId))];
      const clinicIds = [...new Set(summaryAgg.map((r) => r.clinicId).filter(Boolean))] as number[];

      const [providers, clinicsList] = await Promise.all([
        prisma.provider.findMany({
          where: { id: { in: providerIds } },
          select: { id: true, firstName: true, lastName: true },
        }),
        prisma.clinic.findMany({
          where: { id: { in: clinicIds } },
          select: { id: true, name: true },
        }),
      ]);

      // Distinct patient counts per provider+clinic via parameterized SQL
      const conditions = [`"createdAt" >= $1`, `"createdAt" <= $2`];
      const params: (Date | number)[] = [startDate, endDate];
      let paramIdx = 3;

      if (clinicId) {
        conditions.push(`"clinicId" = $${paramIdx}`);
        params.push(Number(clinicId));
        paramIdx++;
      }
      if (providerId) {
        conditions.push(`"providerId" = $${paramIdx}`);
        params.push(Number(providerId));
        paramIdx++;
      }

      const distinctPatientCounts = await prisma.$queryRawUnsafe<
        { providerId: number; clinicId: number; uniquePatients: bigint }[]
      >(
        `SELECT "providerId", "clinicId", COUNT(DISTINCT "patientId") as "uniquePatients"
         FROM "Order"
         WHERE ${conditions.join(' AND ')}
         GROUP BY "providerId", "clinicId"`,
        ...params
      );

      const distinctMap = new Map<string, number>();
      for (const row of distinctPatientCounts) {
        distinctMap.set(`${row.providerId}-${row.clinicId}`, Number(row.uniquePatients));
      }

      const providerMap = new Map(providers.map((p) => [p.id, p]));
      const clinicMap = new Map(clinicsList.map((c) => [c.id, c]));

      const byProvider: ProviderRxSummary[] = summaryAgg
        .map((agg) => {
          const provider = providerMap.get(agg.providerId);
          const clinic = clinicMap.get(agg.clinicId as number);
          const key = `${agg.providerId}-${agg.clinicId}`;
          return {
            providerId: agg.providerId,
            providerName: provider
              ? `${provider.firstName} ${provider.lastName}`.trim()
              : 'Unknown',
            clinicId: (agg.clinicId as number) ?? 0,
            clinicName: clinic?.name ?? 'Unknown',
            prescriptionCount: agg._count.id,
            uniquePatients: distinctMap.get(key) ?? 0,
          };
        })
        .sort((a, b) => b.prescriptionCount - a.prescriptionCount);

      return {
        summary: {
          totalPrescriptions: totalCount,
          uniquePatients: uniquePatientResult.length,
          activeProviders: providerIds.length,
          clinicCount: clinicIds.length,
          byProvider,
        },
        details,
        pagination: {
          page,
          limit,
          total: totalCount,
          hasMore: offset + details.length < totalCount,
        },
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      };
    });
  },

  /**
   * Fetch ALL detail rows for export (no pagination limit).
   * Used by the CSV/PDF export endpoint.
   */
  async getAllDetailsForExport(
    filters: Omit<PrescriptionReportFilters, 'page' | 'limit'>
  ): Promise<{
    details: PrescriptionDetailRow[];
    summary: PrescriptionReportResult['summary'];
    dateRange: { startDate: string; endDate: string };
  }> {
    const { clinicId, providerId } = filters;
    const { startDate, endDate } = computeDateRange(
      filters.period,
      filters.startDate,
      filters.endDate
    );

    const where: Record<string, unknown> = {
      createdAt: { gte: startDate, lte: endDate },
    };
    if (clinicId) where.clinicId = clinicId;
    if (providerId) where.providerId = providerId;

    return withoutClinicFilter(async () => {
      const orders = await prisma.order.findMany({
        where,
        select: {
          id: true,
          lifefileOrderId: true,
          createdAt: true,
          patientId: true,
          providerId: true,
          clinicId: true,
          status: true,
          rxs: {
            select: {
              medName: true,
              strength: true,
              form: true,
              quantity: true,
            },
          },
          patient: {
            select: { id: true, firstName: true, lastName: true },
          },
          provider: {
            select: { id: true, firstName: true, lastName: true },
          },
          clinic: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const details: PrescriptionDetailRow[] = orders.map((order) =>
        mapOrderToDetail(order as unknown as ReportOrder)
      );

      // Summary aggregation
      const uniquePatients = new Set(details.map((d) => d.patientId));
      const providerSet = new Map<string, ProviderRxSummary>();

      for (const row of details) {
        const key = `${row.providerId}-${row.clinicId}`;
        const existing = providerSet.get(key);
        if (existing) {
          existing.prescriptionCount++;
          const patKey = `${key}-${row.patientId}`;
          if (!providerSet.has(patKey + '_pat')) {
            providerSet.set(patKey + '_pat', {} as ProviderRxSummary);
            existing.uniquePatients++;
          }
        } else {
          providerSet.set(key, {
            providerId: row.providerId,
            providerName: row.providerName,
            clinicId: row.clinicId,
            clinicName: row.clinicName,
            prescriptionCount: 1,
            uniquePatients: 1,
          });
          providerSet.set(`${key}-${row.patientId}_pat`, {} as ProviderRxSummary);
        }
      }

      const byProvider = [...providerSet.entries()]
        .filter(([key]) => !key.endsWith('_pat'))
        .map(([, v]) => v)
        .sort((a, b) => b.prescriptionCount - a.prescriptionCount);

      const clinicIdSet = new Set(details.map((d) => d.clinicId));

      return {
        details,
        summary: {
          totalPrescriptions: details.length,
          uniquePatients: uniquePatients.size,
          activeProviders: new Set(details.map((d) => d.providerId)).size,
          clinicCount: clinicIdSet.size,
          byProvider,
        },
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      };
    });
  },
};
