/**
 * OT Men's Health (ot.eonpro.io) — retail package catalog from the internal pricing calculator
 * (bundles, Rx, research peptides, GLP-1s). Amounts are USD cents. Used when quoting / picking
 * line items for payments and invoices — not Lifefile COGS.
 *
 * Tier math for most SKUs: 6mo = round(3mo×2×0.97), 12mo = round(6mo×2×0.97), matching the live calculator.
 */

export type OtRetailPackageCategory = 'bundles' | 'rx' | 'research' | 'glp';

/** Display / filter bucket (matches calculator tabs). */
export type OtRetailPackageKind = 'bundle' | 'rx' | 'research' | 'glp';

export type OtRetailDurationMonths = 1 | 3 | 6 | 12;

export interface OtRetailPackage {
  id: string;
  name: string;
  subtitle: string;
  category: OtRetailPackageCategory;
  kind: OtRetailPackageKind;
  /** Retail totals in USD cents by supply length (months). Omitted = not offered. */
  priceCentsByDurationMonths: Partial<Record<OtRetailDurationMonths, number>>;
  /** Durations above this are N/A (e.g. 3mo max vial SKUs). */
  maxDurationMonths?: 1 | 3;
  /** Same dollar total regardless of duration column (calculator "flat" SKUs). */
  flatRate?: boolean;
  /** Calculator allows quantity >1 for this line. */
  allowsMultipleQuantity?: boolean;
  /** Optional hint for monthly-average tooling (calculator `months` field). */
  billingCycleMonthsHint?: number;
  /** Freeform — constraints, cycles, etc. */
  notes?: string;
}

function ac(m3Usd: number, m1Usd?: number): Partial<Record<OtRetailDurationMonths, number>> {
  const m6 = Math.round(m3Usd * 2 * 0.97);
  const m12 = Math.round(m6 * 2 * 0.97);
  const o: Partial<Record<OtRetailDurationMonths, number>> = {
    3: Math.round(m3Usd * 100),
    6: m6 * 100,
    12: m12 * 100,
  };
  if (m1Usd !== undefined) o[1] = Math.round(m1Usd * 100);
  return o;
}

/** Canonical list — order matches calculator categories for readability. */
export const OT_RETAIL_PACKAGES: OtRetailPackage[] = [
  // Bundles
  {
    id: 'hw',
    name: 'Handsome + Wealthy',
    subtitle: 'Enclomiphene + NAD+',
    category: 'bundles',
    kind: 'bundle',
    priceCentsByDurationMonths: { 3: 161_700, 6: 313_500, 12: 608_200 },
  },
  {
    id: 'build',
    name: 'Build',
    subtitle: 'Enclomiphene 25mg + Sermorelin',
    category: 'bundles',
    kind: 'bundle',
    priceCentsByDurationMonths: { 3: 126_800, 6: 246_000, 12: 477_300 },
  },
  {
    id: 'bplus',
    name: 'BuildPlus (Enclo + Sermorelin + Tadalafil)',
    subtitle: 'Full hormonal + GH + AR',
    category: 'bundles',
    kind: 'bundle',
    priceCentsByDurationMonths: { 3: 148_200, 6: 287_500, 12: 557_800 },
  },
  {
    id: 'regen',
    name: 'Regen+',
    subtitle: 'NAD+ + Glutathione',
    category: 'bundles',
    kind: 'bundle',
    priceCentsByDurationMonths: { 3: 122_500, 6: 237_700, 12: 461_100 },
  },
  // Prescription
  {
    id: 'trtplus',
    name: 'TRT Plus',
    subtitle: 'Testosterone Cyp + Enclo + Anastrozole',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: { 3: 66_900, 6: 128_500, 12: 242_900 },
  },
  {
    id: 'trtsolo',
    name: 'TRT Solo',
    subtitle: 'Testosterone Cypionate — no anastrozole',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: { 3: 47_000, 6: 91_200, 12: 177_600 },
  },
  {
    id: 'enclo25',
    name: 'Enclomiphene 25mg',
    subtitle: '28 / 84 tabs',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: ac(649),
  },
  {
    id: 'enclom',
    name: 'Enclomiphene maintenance 25mg',
    subtitle: '14 / 42 tab supply',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: ac(379),
  },
  {
    id: 'nad',
    name: 'NAD+ 1000mg',
    subtitle: '200mg/5mL per vial',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: { 1: 39_900, 3: 99_900, 6: 195_000, 12: 375_000 },
  },
  {
    id: 'glut',
    name: 'Glutathione 200mg',
    subtitle: '2x per week',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: ac(225),
  },
  {
    id: 'serm',
    name: 'Sermorelin 10mg',
    subtitle: 'Pharmaceutical GHRH — long-term safe',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: { 1: 24_900, 3: 64_900, 6: 125_900, 12: 250_000 },
  },
  {
    id: 'tad',
    name: 'Tadalafil 5mg daily',
    subtitle: 'AR density + vascular health',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: ac(249),
  },
  {
    id: 'ai50',
    name: 'Anastrozole .50mg add-on',
    subtitle: '8 / 24 / 48 tabs',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: ac(99),
  },
  {
    id: 'ai25',
    name: 'Anastrozole .25mg add-on',
    subtitle: '8 / 24 / 48 tabs',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: ac(99),
  },
  {
    id: 'hcg',
    name: 'HCG',
    subtitle: 'Fertility preservation',
    category: 'rx',
    kind: 'rx',
    priceCentsByDurationMonths: ac(499),
  },
  // Research
  {
    id: 'tesaipa',
    name: 'Tesa/IPA blend',
    subtitle: 'Tesamorelin 12mg + Ipamorelin 3mg',
    category: 'research',
    kind: 'research',
    maxDurationMonths: 3,
    priceCentsByDurationMonths: { 3: 99_900 },
  },
  {
    id: 'mots',
    name: 'MOTS-C 10mg',
    subtitle: 'AMPK + metabolic efficiency',
    category: 'research',
    kind: 'research',
    maxDurationMonths: 3,
    priceCentsByDurationMonths: { 3: 57_500 },
  },
  {
    id: 'bpctb',
    name: 'BPC-TB500 10mg',
    subtitle: 'Connective tissue + systemic healing',
    category: 'research',
    kind: 'research',
    priceCentsByDurationMonths: ac(809),
  },
  {
    id: 'bpc',
    name: 'BPC-157 10mg',
    subtitle: 'Tissue repair + angiogenesis',
    category: 'research',
    kind: 'research',
    priceCentsByDurationMonths: ac(525),
  },
  {
    id: 'tesa20',
    name: 'Tesamorelin 20mg',
    subtitle: 'Visceral fat specialist',
    category: 'research',
    kind: 'research',
    maxDurationMonths: 3,
    priceCentsByDurationMonths: { 3: 80_900 },
  },
  {
    id: 'ghkcu',
    name: 'GHK-Cu 50mg',
    subtitle: 'Regenerative genes + collagen + hair',
    category: 'research',
    kind: 'research',
    priceCentsByDurationMonths: ac(299),
  },
  {
    id: 'ghkcream',
    name: 'GHK-Cu cream',
    subtitle: 'Topical collagen + skin',
    category: 'research',
    kind: 'research',
    priceCentsByDurationMonths: ac(987),
  },
  {
    id: 'ipa',
    name: 'Ipamorelin 10mg',
    subtitle: 'GH peptide — ghrelin mimetic',
    category: 'research',
    kind: 'research',
    priceCentsByDurationMonths: ac(499),
  },
  {
    id: 'kpv',
    name: 'KPV 10mg',
    subtitle: 'Anti-inflammatory + gut health',
    category: 'research',
    kind: 'research',
    priceCentsByDurationMonths: ac(525),
  },
  {
    id: 'semax',
    name: 'Semax 11mg',
    subtitle: 'BDNF + cognitive edge + dopamine',
    category: 'research',
    kind: 'research',
    priceCentsByDurationMonths: ac(399, 199),
  },
  {
    id: 'selank',
    name: 'Selank 11mg',
    subtitle: 'Calm + focused + cortisol modulation',
    category: 'research',
    kind: 'research',
    priceCentsByDurationMonths: ac(399, 199),
  },
  {
    id: 'epithalon',
    name: 'Epithalon 50mg',
    subtitle: 'Telomere — 14-day cycle ONLY, once/year',
    category: 'research',
    kind: 'research',
    flatRate: true,
    billingCycleMonthsHint: 1,
    priceCentsByDurationMonths: { 1: 52_500, 3: 52_500, 6: 52_500, 12: 52_500 },
    notes: 'Flat rate at any duration in calculator',
  },
  {
    id: 'mt2',
    name: 'Melanotan 2 10mg',
    subtitle: 'Tan + appetite + libido',
    category: 'research',
    kind: 'research',
    flatRate: true,
    allowsMultipleQuantity: true,
    billingCycleMonthsHint: 3,
    priceCentsByDurationMonths: { 1: 19_900, 3: 19_900, 6: 19_900, 12: 19_900 },
  },
  {
    id: 'dsip',
    name: 'DSIP',
    subtitle: 'Sleep quality + GH release — 6-week cycle',
    category: 'research',
    kind: 'research',
    flatRate: true,
    allowsMultipleQuantity: true,
    billingCycleMonthsHint: 1.5,
    priceCentsByDurationMonths: { 1: 22_900, 3: 22_900, 6: 22_900, 12: 22_900 },
  },
  {
    id: 'reta5',
    name: 'Retatrutide 5mg',
    subtitle: 'Triple agonist',
    category: 'research',
    kind: 'research',
    maxDurationMonths: 1,
    billingCycleMonthsHint: 1,
    priceCentsByDurationMonths: { 1: 29_900 },
  },
  {
    id: 'reta10',
    name: 'Retatrutide 10mg',
    subtitle: 'Triple agonist — high dose',
    category: 'research',
    kind: 'research',
    maxDurationMonths: 3,
    billingCycleMonthsHint: 1,
    priceCentsByDurationMonths: { 1: 39_900, 3: 39_900 },
  },
  {
    id: 'reta20',
    name: 'Retatrutide 20mg',
    subtitle: 'Triple agonist — maximum dose',
    category: 'research',
    kind: 'research',
    flatRate: true,
    allowsMultipleQuantity: true,
    billingCycleMonthsHint: 3,
    priceCentsByDurationMonths: { 1: 74_900, 3: 74_900, 6: 74_900, 12: 74_900 },
  },
  // GLP-1
  {
    id: 'sem2',
    name: 'Semaglutide 2.5mg/mL',
    subtitle: 'GLP-1 appetite + insulin sensitivity',
    category: 'glp',
    kind: 'glp',
    priceCentsByDurationMonths: ac(849),
  },
  {
    id: 'tirz',
    name: 'Tirzepatide 10mg/mL',
    subtitle: 'GLP-1 + GIP dual agonist',
    category: 'glp',
    kind: 'glp',
    priceCentsByDurationMonths: ac(1049),
  },
];

export function formatOtRetailUsd(priceCents: number | null | undefined): string {
  if (priceCents == null) return '—';
  return `$${(priceCents / 100).toFixed(2)}`;
}

export function getOtRetailPackageById(id: string): OtRetailPackage | undefined {
  return OT_RETAIL_PACKAGES.find((p) => p.id === id);
}

/** Resolved retail price for a package at a given duration, or null if not sold. */
export function getOtRetailPackagePriceCents(
  pkg: OtRetailPackage,
  months: OtRetailDurationMonths
): number | null {
  if (pkg.maxDurationMonths != null && months > pkg.maxDurationMonths) return null;
  const c = pkg.priceCentsByDurationMonths[months];
  return c !== undefined ? c : null;
}

export function filterOtRetailPackages(
  packages: OtRetailPackage[],
  query: string
): OtRetailPackage[] {
  const q = query.trim().toLowerCase();
  if (!q) return packages;
  return packages.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.subtitle.toLowerCase().includes(q) ||
      (p.notes && p.notes.toLowerCase().includes(q))
  );
}

function escapeCsvCell(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function usdCell(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

/** UTF-8 BOM CSV for Excel — full duration columns. */
export function exportOtRetailPackagesCsv(
  packages: OtRetailPackage[] = OT_RETAIL_PACKAGES
): string {
  const BOM = '\uFEFF';
  const header = [
    'id',
    'name',
    'subtitle',
    'category',
    'kind',
    '1mo_usd',
    '3mo_usd',
    '6mo_usd',
    '12mo_usd',
    'max_dur_mo',
    'flat',
    'multi_qty',
    'notes',
  ].join(',');
  const lines = packages.map((p) =>
    [
      p.id,
      p.name,
      p.subtitle,
      p.category,
      p.kind,
      usdCell(getOtRetailPackagePriceCents(p, 1)),
      usdCell(getOtRetailPackagePriceCents(p, 3)),
      usdCell(getOtRetailPackagePriceCents(p, 6)),
      usdCell(getOtRetailPackagePriceCents(p, 12)),
      p.maxDurationMonths ?? '',
      p.flatRate ? 'yes' : '',
      p.allowsMultipleQuantity ? 'yes' : '',
      p.notes ?? '',
    ]
      .map((c) => escapeCsvCell(String(c)))
      .join(',')
  );
  return [BOM, header, ...lines].join('\r\n');
}

export const OT_RETAIL_CATEGORY_LABELS: Record<OtRetailPackageCategory | 'all', string> = {
  all: 'All',
  bundles: 'Bundles',
  rx: 'Prescription',
  research: 'Research',
  glp: 'GLP-1s',
};
