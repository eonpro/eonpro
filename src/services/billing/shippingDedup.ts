/**
 * SHIPPING DEDUPLICATION FOR ADD-ON PRODUCTS
 *
 * Business rule: A patient must not be charged shipping more than once per day
 * for add-on product orders (Elite Bundle, NAD+, B12/Cyanocobalamin, Sermorelin).
 *
 * This module provides:
 * - Detection of shipping line items in an invoice
 * - Detection of add-on product line items
 * - A DB check for whether the patient already has a same-day invoice
 *   containing shipping for add-on products
 * - A helper that strips duplicate shipping from line items
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { startOfDay, endOfDay } from 'date-fns';

// ─── Constants ─────────────────────────────────────────────────────────────

const ADDON_KEYWORDS = [
  'elite bundle',
  'elite package',
  'nad+',
  'nad ',
  'sermorelin',
  'b12',
  'cyanocobalamin',
];

const SHIPPING_KEYWORDS = ['shipping', 'delivery', 'freight'];

// ─── Detectors ─────────────────────────────────────────────────────────────

interface LineItemLike {
  description?: string;
  product?: string;
  medicationType?: string;
  addonId?: string;
  category?: string;
  [key: string]: unknown;
}

/** Returns true if the line item represents a shipping charge. */
export function isShippingLineItem(item: LineItemLike): boolean {
  const desc = (item.description || '').toLowerCase();
  const cat = (item.category || '').toLowerCase();
  const prod = (item.product || '').toLowerCase();
  return (
    cat === 'shipping' || SHIPPING_KEYWORDS.some((kw) => desc.includes(kw) || prod.includes(kw))
  );
}

/** Returns true if the line item is an add-on product. */
export function isAddonLineItem(item: LineItemLike): boolean {
  if (item.addonId) return true;
  if ((item.medicationType || '').toLowerCase() === 'add-on') return true;
  if ((item.category || '').toLowerCase() === 'addons') return true;

  const combined = `${item.product || ''} ${item.description || ''}`.toLowerCase();
  return ADDON_KEYWORDS.some((kw) => combined.includes(kw));
}

// ─── DB check ──────────────────────────────────────────────────────────────

/**
 * Check whether the patient already has a PAID or OPEN invoice **today**
 * that contains both add-on products and a shipping charge.
 *
 * "Today" is defined by the `referenceDate` (defaults to now), using
 * UTC start/end of day.
 */
export async function hasShippingChargedTodayForAddons(
  patientId: number,
  clinicId: number | undefined,
  referenceDate: Date = new Date()
): Promise<boolean> {
  const dayStart = startOfDay(referenceDate);
  const dayEnd = endOfDay(referenceDate);

  const todaysInvoices = await prisma.invoice.findMany({
    where: {
      patientId,
      ...(clinicId ? { clinicId } : {}),
      status: { in: ['PAID', 'OPEN'] },
      createdAt: { gte: dayStart, lte: dayEnd },
    },
    select: { lineItems: true },
  });

  for (const inv of todaysInvoices) {
    const items = (inv.lineItems as LineItemLike[] | null) || [];
    const hasAddon = items.some(isAddonLineItem);
    const hasShipping = items.some(isShippingLineItem);
    if (hasAddon && hasShipping) return true;
  }

  return false;
}

// ─── Line-item filter ──────────────────────────────────────────────────────

/**
 * Given a set of line items for a new invoice, strip shipping charges
 * if this invoice contains add-on products AND the patient already has
 * a same-day invoice with shipping for add-ons.
 *
 * Returns `{ items, shippingRemoved }`.
 */
export async function deduplicateShipping<T extends LineItemLike>(
  lineItems: T[],
  patientId: number,
  clinicId: number | undefined
): Promise<{ items: T[]; shippingRemoved: boolean }> {
  const hasAddon = lineItems.some(isAddonLineItem);
  const hasShipping = lineItems.some(isShippingLineItem);

  if (!hasAddon || !hasShipping) {
    return { items: lineItems, shippingRemoved: false };
  }

  const alreadyCharged = await hasShippingChargedTodayForAddons(patientId, clinicId);
  if (!alreadyCharged) {
    return { items: lineItems, shippingRemoved: false };
  }

  const filtered = lineItems.filter((item) => !isShippingLineItem(item));

  logger.info('[SHIPPING-DEDUP] Removed duplicate shipping for same-day addon order', {
    patientId,
    clinicId,
    originalCount: lineItems.length,
    filteredCount: filtered.length,
  });

  return { items: filtered, shippingRemoved: true };
}
