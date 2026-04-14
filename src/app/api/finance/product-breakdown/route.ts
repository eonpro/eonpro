/**
 * Product Breakdown API
 *
 * GET /api/finance/product-breakdown
 * Returns unit counts and revenue per product category for paid invoices.
 *
 * Query params:
 *   range: 7d | 30d | 90d | quarter | semester | 12m | ytd | all | custom
 *   startDate, endDate: required when range=custom (ISO date strings)
 *
 * Categories each invoice line item into:
 *   Semaglutide, Tirzepatide, Elite Bundle, NAD+, B12, Sermorelin, Other
 *
 * Parses from lineItems JSON (product, medicationType, addonId, description)
 * and metadata JSON (product, selectedAddons) since WellMedR invoices use
 * JSON fields rather than InvoiceItem rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClinicContext } from '@/lib/db';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { subDays, subMonths, startOfYear, startOfQuarter, endOfQuarter } from 'date-fns';

// ─── Product classification ────────────────────────────────────────────────

type ProductCategory =
  | 'Semaglutide'
  | 'Tirzepatide'
  | 'Elite Bundle'
  | 'NAD+'
  | 'B12'
  | 'Sermorelin'
  | 'Other';

const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Semaglutide',
  'Tirzepatide',
  'Elite Bundle',
  'NAD+',
  'B12',
  'Sermorelin',
  'Other',
];

function classifyProduct(
  product?: string,
  description?: string,
  medicationType?: string,
  addonId?: string
): ProductCategory {
  const p = (product || '').toLowerCase();
  const d = (description || '').toLowerCase();
  const combined = `${p} ${d} ${(medicationType || '').toLowerCase()}`;

  if (
    addonId === 'elite_bundle' ||
    combined.includes('elite bundle') ||
    combined.includes('elite package')
  )
    return 'Elite Bundle';
  if (addonId === 'nad_plus' || combined.includes('nad+') || combined.includes('nad '))
    return 'NAD+';
  if (addonId === 'b12' || combined.includes('b12') || combined.includes('cyanocobalamin'))
    return 'B12';
  if (addonId === 'sermorelin' || combined.includes('sermorelin')) return 'Sermorelin';
  if (
    combined.includes('semaglutide') ||
    combined.includes('ozempic') ||
    combined.includes('wegovy')
  )
    return 'Semaglutide';
  if (
    combined.includes('tirzepatide') ||
    combined.includes('mounjaro') ||
    combined.includes('zepbound')
  )
    return 'Tirzepatide';

  return 'Other';
}

interface LineItemJSON {
  product?: string;
  description?: string;
  medicationType?: string;
  addonId?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
}

interface InvoiceMetadataJSON {
  product?: string;
  selectedAddons?: string[];
  medicationType?: string;
  [key: string]: unknown;
}

// ─── Date range helpers ────────────────────────────────────────────────────

function getSemesterBounds(date: Date): { start: Date; end: Date } {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month < 6) {
    return { start: new Date(year, 0, 1), end: new Date(year, 5, 30, 23, 59, 59) };
  }
  return { start: new Date(year, 6, 1), end: new Date(year, 11, 31, 23, 59, 59) };
}

function parseDateRange(
  range: string,
  startDateParam?: string | null,
  endDateParam?: string | null
): { startDate: Date; endDate: Date } | null {
  const now = new Date();

  if (range === 'custom' && startDateParam && endDateParam) {
    let startDate = new Date(startDateParam);
    let endDate = new Date(endDateParam);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
    if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
    return { startDate, endDate };
  }

  let startDate: Date;
  const endDate = now;

  switch (range) {
    case '7d':
      startDate = subDays(now, 7);
      break;
    case '90d':
      startDate = subDays(now, 90);
      break;
    case 'quarter':
      startDate = startOfQuarter(now);
      break;
    case 'semester': {
      const s = getSemesterBounds(now);
      return { startDate: s.start, endDate: s.end };
    }
    case '12m':
      startDate = subMonths(now, 12);
      break;
    case 'ytd':
      startDate = startOfYear(now);
      break;
    case 'all':
      startDate = new Date(2020, 0, 1);
      break;
    case '30d':
    default:
      startDate = subDays(now, 30);
      break;
  }

  return { startDate, endDate };
}

// ─── Handler ───────────────────────────────────────────────────────────────

async function getHandler(request: NextRequest, user: AuthUser) {
  try {
    const contextClinicId = getClinicContext();
    const clinicId = contextClinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';

    const dateRange = parseDateRange(
      range,
      searchParams.get('startDate'),
      searchParams.get('endDate')
    );
    if (!dateRange) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        clinicId,
        status: 'PAID',
        paidAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      select: {
        id: true,
        description: true,
        amount: true,
        amountPaid: true,
        lineItems: true,
        metadata: true,
        paidAt: true,
      },
      orderBy: { paidAt: 'desc' },
    });

    // Aggregate by product category
    const breakdown: Record<ProductCategory, { count: number; revenue: number }> = {} as any;
    for (const cat of PRODUCT_CATEGORIES) {
      breakdown[cat] = { count: 0, revenue: 0 };
    }

    let totalRevenue = 0;
    let totalUnits = 0;

    for (const invoice of invoices) {
      const lineItems = (invoice.lineItems as LineItemJSON[] | null) || [];
      const metadata = (invoice.metadata as InvoiceMetadataJSON | null) || {};

      if (lineItems.length > 0) {
        for (const item of lineItems) {
          const category = classifyProduct(
            item.product,
            item.description,
            item.medicationType,
            item.addonId
          );
          const qty = item.quantity || 1;
          const amount = item.amount ?? item.unitPrice ?? 0;

          breakdown[category].count += qty;
          breakdown[category].revenue += amount;
          totalRevenue += amount;
          totalUnits += qty;
        }
      } else {
        // No structured line items — classify from invoice-level fields
        const category = classifyProduct(
          metadata.product,
          invoice.description || undefined,
          metadata.medicationType
        );
        const amount = invoice.amountPaid || invoice.amount || 0;

        breakdown[category].count += 1;
        breakdown[category].revenue += amount;
        totalRevenue += amount;
        totalUnits += 1;
      }
    }

    const products = PRODUCT_CATEGORIES.filter((cat) => breakdown[cat].count > 0)
      .map((cat) => ({
        product: cat,
        count: breakdown[cat].count,
        revenue: breakdown[cat].revenue,
        percentageOfRevenue:
          totalRevenue > 0 ? Math.round((breakdown[cat].revenue / totalRevenue) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      products,
      totalRevenue,
      totalUnits,
      invoiceCount: invoices.length,
      dateRange: {
        start: dateRange.startDate.toISOString(),
        end: dateRange.endDate.toISOString(),
      },
    });
  } catch (error) {
    logger.error('[PRODUCT_BREAKDOWN]', error);
    return NextResponse.json({ error: 'Failed to compute product breakdown' }, { status: 500 });
  }
}

export const GET = withAdminAuth(getHandler);
