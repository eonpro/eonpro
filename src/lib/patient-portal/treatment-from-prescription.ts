/**
 * Derive patient portal treatment type from prescription/order data.
 * Used so portal features (weight loss vs hormone/bloodwork tools) follow the
 * patient's actual treatment, not just the clinic's default.
 */

import type { PortalTreatmentType } from './types';

/** Normalized medication name → portal treatment type (order matters: first match wins) */
const MEDICATION_TO_TREATMENT: Array<{ pattern: RegExp | string; treatment: PortalTreatmentType }> =
  [
    // GLP-1 / weight loss
    { pattern: /semaglutide|ozempic|wegovy|rybelsus/i, treatment: 'weight_loss' },
    { pattern: /tirzepatide|mounjaro|zepbound/i, treatment: 'weight_loss' },
    { pattern: /liraglutide|saxenda/i, treatment: 'weight_loss' },
    { pattern: /glp-?1|glp1/i, treatment: 'weight_loss' },
    // Hormone therapy / TRT
    {
      pattern: /testosterone|cypionate|enanthate|propionate|undecanoate/i,
      treatment: 'hormone_therapy',
    },
    { pattern: /hcg\b|chorionic gonadotropin/i, treatment: 'hormone_therapy' },
    { pattern: /anastrozole|arimidex|clomid|clomiphene/i, treatment: 'hormone_therapy' },
    { pattern: /estradiol|estrogen|progesterone|bioidentical/i, treatment: 'hormone_therapy' },
    // Peptides / wellness
    { pattern: /bpc-?157|tb-?500|ipamorelin|ghrh|growth hormone/i, treatment: 'general_wellness' },
    { pattern: /peptide/i, treatment: 'general_wellness' },
    // Men's / women's / sexual health (can overlap with hormone; keep after hormone)
    {
      pattern: /sexual health|ed treatment|sildenafil|tadalafil|viagra|cialis/i,
      treatment: 'sexual_health',
    },
    { pattern: /men'?s health|male wellness/i, treatment: 'mens_health' },
    { pattern: /women'?s health|female wellness/i, treatment: 'womens_health' },
    { pattern: /anti-?aging|longevity/i, treatment: 'anti_aging' },
  ];

/**
 * Returns the portal treatment type for a given medication name, or null if no match.
 */
export function getTreatmentTypeFromMedicationName(
  medName: string | null | undefined
): PortalTreatmentType | null {
  if (!medName || typeof medName !== 'string') return null;
  const normalized = medName.trim();
  if (!normalized) return null;
  for (const { pattern, treatment } of MEDICATION_TO_TREATMENT) {
    if (typeof pattern === 'string') {
      if (normalized.toLowerCase().includes(pattern.toLowerCase())) return treatment;
    } else {
      if (pattern.test(normalized)) return treatment;
    }
  }
  return null;
}

/**
 * Derives portal treatment type from an order (primaryMedName and/or first Rx medName).
 * Used server-side when resolving patient context for the portal.
 */
export function getTreatmentTypeFromOrder(order: {
  primaryMedName?: string | null;
  rxs?: Array<{ medName?: string | null }>;
}): PortalTreatmentType | null {
  const fromPrimary = getTreatmentTypeFromMedicationName(order.primaryMedName);
  if (fromPrimary) return fromPrimary;
  const rxs = order.rxs || [];
  for (const rx of rxs) {
    const fromRx = getTreatmentTypeFromMedicationName(rx.medName);
    if (fromRx) return fromRx;
  }
  return null;
}
