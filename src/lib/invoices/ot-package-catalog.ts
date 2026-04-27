/**
 * OT Men's Health (ot.eonpro.io) — package catalog for the manual reconciliation report.
 *
 * Source of truth for the per-package pricing the OT clinic uses across
 * 1 / 3 / 6 / 12 month plans. Each row carries:
 *   - retail cents the clinic charges the patient per tier
 *   - pharmacy cost cents charged back to the clinic per tier
 *   - default doctor consult fee
 *   - default shipping fee
 *
 * Used by the "Apply package" picker on the manual reconciliation editor to
 * pre-fill a sale's allocation in one click. Admin can override any field
 * after applying. All amounts are USD cents.
 */

export type OtPackageTier = 1 | 3 | 6 | 12;

export type OtPackageCategory = 'rx' | 'bundle' | 'addon' | 'lab' | 'consult' | 'research';

export interface OtPackageCatalogRow {
  /** Stable id for selection in the UI. Lowercase, dash-separated. */
  id: string;
  /** Display name (matches the OT pricing sheet). */
  name: string;
  /** Optional secondary description. */
  subtitle?: string;
  category: OtPackageCategory;
  /** Retail cents charged to the patient by tier. Missing tiers = not offered. */
  retailCentsByTier: Partial<Record<OtPackageTier, number>>;
  /** Pharmacy cost cents charged to the clinic by tier. Missing tiers = not offered. */
  costCentsByTier: Partial<Record<OtPackageTier, number>>;
  /** Default doctor consult cents (admin can override to any of $0/$15/$30/$50). */
  defaultConsultCents: number;
  /** Default shipping cents (admin can override to any of $0/$20/$30). */
  defaultShippingCents: number;
  /** True for research-only / non-Rx peptides. */
  researchOnly?: boolean;
}

const $ = (usd: number) => Math.round(usd * 100);

// ---------------------------------------------------------------------------
// Rx (prescription) packages
// ---------------------------------------------------------------------------

const RX_ROWS: OtPackageCatalogRow[] = [
  {
    id: 'enclomiphene-25mg',
    name: 'Enclomiphene 25mg (28/84)',
    category: 'rx',
    retailCentsByTier: { 1: $(249), 3: $(649), 6: $(1259), 12: $(2442) },
    costCentsByTier: { 1: $(45), 3: $(135), 6: $(270), 12: $(540) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
  {
    id: 'enclomiphene-25mg-maintenance',
    name: 'Enclomiphene maintenance 25mg 14/42',
    category: 'rx',
    retailCentsByTier: { 1: $(149), 3: $(379), 6: $(735), 12: $(1426) },
    costCentsByTier: { 1: $(30), 3: $(90), 6: $(180), 12: $(360) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
  {
    id: 'nad-1000mg',
    name: 'NAD+ 1000mg (200mg/5mL)',
    category: 'rx',
    retailCentsByTier: { 1: $(349), 3: $(999), 6: $(1950), 12: $(3750) },
    costCentsByTier: { 1: $(110), 3: $(330), 6: $(660), 12: $(1220) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
  {
    id: 'glutathione-200mg',
    name: 'Glutathione (200mg)',
    category: 'rx',
    retailCentsByTier: { 3: $(225), 6: $(437), 12: $(848) },
    costCentsByTier: { 3: $(40), 6: $(80), 12: $(160) },
    defaultConsultCents: $(15),
    defaultShippingCents: $(20),
  },
  {
    id: 'tadalafil-5mg',
    name: 'Tadalafil 5mg (28/84)',
    category: 'rx',
    retailCentsByTier: { 1: $(149), 3: $(249), 6: $(483), 12: $(937) },
    costCentsByTier: { 1: $(30), 3: $(90) },
    defaultConsultCents: $(15),
    defaultShippingCents: $(20),
  },
  {
    id: 'sermorelin',
    name: 'Sermorelin',
    category: 'rx',
    retailCentsByTier: { 1: $(249), 3: $(649), 6: $(1259), 12: $(2500) },
    costCentsByTier: { 1: $(120), 3: $(360) },
    defaultConsultCents: $(15),
    defaultShippingCents: $(20),
  },
  {
    id: 'semaglutide',
    name: 'Semaglutide (1 vial 2.5mg/mL · 3 vial 2.5mg/mL)',
    category: 'rx',
    retailCentsByTier: { 1: $(299), 3: $(849), 6: $(1647), 12: $(3395) },
    costCentsByTier: { 1: $(75), 3: $(225), 6: $(720), 12: $(1440) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
  {
    id: 'tirzepatide',
    name: 'Tirzepatide (1 vial 10mg/mL · 3 vial 10mg/mL)',
    category: 'rx',
    retailCentsByTier: { 1: $(399), 3: $(1049), 6: $(2035), 12: $(3948) },
    costCentsByTier: { 1: $(150), 3: $(450) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(30),
  },
  {
    id: 'trt-plus',
    name: 'TRT Plus (Testosterone Cypionate 200mg/4mL + Enclomiphene 25mg)',
    subtitle: 'Anastrozole 12/36 only NY and FL',
    category: 'rx',
    retailCentsByTier: { 1: $(239), 3: $(669), 6: $(1285), 12: $(2429) },
    costCentsByTier: { 1: $(48), 3: $(144), 6: $(288), 12: $(576) },
    defaultConsultCents: $(50),
    defaultShippingCents: $(30),
  },
  {
    id: 'trt-solo',
    name: 'TRT — by itself',
    category: 'rx',
    retailCentsByTier: { 1: $(239), 3: $(669), 6: $(1285), 12: $(2429) },
    costCentsByTier: { 1: $(25), 3: $(75), 6: $(150), 12: $(300) },
    defaultConsultCents: $(50),
    defaultShippingCents: $(30),
  },
  {
    id: 'trt-anastrozole-2x-week',
    name: 'TRT and anastrozole .25mg 2x/week',
    category: 'rx',
    retailCentsByTier: { 1: $(249), 3: $(699) },
    costCentsByTier: { 1: $(35), 3: $(105) },
    defaultConsultCents: $(50),
    defaultShippingCents: $(30),
  },
];

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

const ADDON_ROWS: OtPackageCatalogRow[] = [
  {
    id: 'anastrozole-50mg-addon',
    name: 'Anastrozole add-on .50mg (8/24/48)',
    category: 'addon',
    retailCentsByTier: { 1: $(69), 3: $(99), 6: $(192), 12: $(372) },
    costCentsByTier: { 1: $(18), 3: $(34), 6: $(58), 12: $(116) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
  {
    id: 'anastrozole-25mg-addon',
    name: 'Anastrozole add-on .25mg (8/24/48)',
    category: 'addon',
    retailCentsByTier: { 1: $(69), 3: $(99), 6: $(192), 12: $(372) },
    costCentsByTier: { 1: $(18), 3: $(34), 6: $(58), 12: $(116) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
  {
    id: 'hcg',
    name: 'HCG',
    category: 'addon',
    retailCentsByTier: { 3: $(499), 6: $(968), 12: $(1878) },
    costCentsByTier: { 3: $(240) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
  {
    id: 'ghk-cu-cream',
    name: 'GHK-Cu cream',
    category: 'addon',
    retailCentsByTier: { 1: $(329) },
    costCentsByTier: { 1: $(125) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
];

// ---------------------------------------------------------------------------
// Bundles
// ---------------------------------------------------------------------------

const BUNDLE_ROWS: OtPackageCatalogRow[] = [
  {
    id: 'handsome-wealthy',
    name: 'Handsome + Wealthy',
    subtitle: 'Enclomiphene 25mg (28/84) + NAD+ 1 vial 1000mg / 3 vial 1000mg',
    category: 'bundle',
    retailCentsByTier: { 1: $(599), 3: $(1817), 6: $(3335), 12: $(6082) },
    costCentsByTier: { 1: $(155), 3: $(465), 6: $(930), 12: $(1860) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(30),
  },
  {
    id: 'build',
    name: 'Build',
    subtitle: 'Enclomiphene + Sermorelin (Enclomiphene 25mg 28/84)',
    category: 'bundle',
    retailCentsByTier: { 1: $(549), 3: $(1268), 6: $(2460), 12: $(4773) },
    costCentsByTier: { 1: $(165), 3: $(495), 6: $(990), 12: $(1980) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(30),
  },
  {
    id: 'build-plus',
    name: 'BuildPlus',
    subtitle: 'Enclomiphene + Sermorelin + Tadalafil (Enclomiphene 25mg 28/84)',
    category: 'bundle',
    retailCentsByTier: { 1: $(549), 3: $(1482), 6: $(2875), 12: $(5578) },
    costCentsByTier: { 1: $(195), 3: $(585) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(30),
  },
  {
    id: 'regen-plus',
    name: 'Regen+',
    subtitle: 'NAD+ 3 vial 1000mg + Glutathione',
    category: 'bundle',
    retailCentsByTier: { 3: $(1225), 6: $(2377), 12: $(4611) },
    costCentsByTier: { 3: $(420) },
    defaultConsultCents: $(30),
    defaultShippingCents: $(20),
  },
];

// ---------------------------------------------------------------------------
// Labs / consults
// ---------------------------------------------------------------------------

const LAB_ROWS: OtPackageCatalogRow[] = [
  {
    id: 'bloodwork-enclo-hcg',
    name: 'Bloodwork (Enclomiphene & HCG)',
    category: 'lab',
    retailCentsByTier: { 1: $(100) },
    costCentsByTier: { 1: $(50) },
    defaultConsultCents: $(10),
    defaultShippingCents: 0,
  },
  {
    id: 'bloodwork-full-panel',
    name: 'Bloodwork (Full Panel)',
    category: 'lab',
    retailCentsByTier: { 1: $(200) },
    costCentsByTier: { 1: $(118) },
    defaultConsultCents: $(10),
    defaultShippingCents: 0,
  },
  {
    id: 'womens-full-panel',
    name: 'WOMENS FULL PANEL',
    category: 'lab',
    retailCentsByTier: { 1: $(200) },
    costCentsByTier: {},
    defaultConsultCents: $(10),
    defaultShippingCents: 0,
  },
  {
    id: 'doctor-consult-video',
    name: 'Doctor Consult — Video',
    category: 'consult',
    retailCentsByTier: { 1: $(50) },
    costCentsByTier: { 1: $(35) },
    defaultConsultCents: $(50),
    defaultShippingCents: 0,
  },
];

// ---------------------------------------------------------------------------
// Research-only peptides
// ---------------------------------------------------------------------------

const RESEARCH_ROWS: OtPackageCatalogRow[] = [
  {
    id: 'melanotan-2-sun-kissed',
    name: 'Melanotan 2 — 10mg / Sun Kissed',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 3: $(199) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'tesamorelin-12-3mg-platinum-recomp',
    name: 'Tesamorelin — 12/3mg / Platinum Recomp',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(350), 3: $(999) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'cjc-ipamorelin-silver-recomp',
    name: 'CJC + Ipamorelin (10mg/10mg) / Silver Recomp',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(299), 3: $(809) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'ipamorelin-recomp-addon',
    name: 'Ipamorelin (10mg) / Recomp Add-On',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(199), 3: $(499) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'bpc-157-healing-protocol',
    name: 'BPC-157 — 10mg / Healing Protocol',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(200), 3: $(525) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'epithalon-longevity',
    name: 'Epithalon — 50mg x 3 vials / Longevity',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(525) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'kpv-anti-inflammation',
    name: 'KPV — 10mg / Anti-inflammation',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(200), 3: $(525) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'semax-cognition-optimization',
    name: 'Semax — 11mg / Cognition Optimization',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(199), 3: $(399) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'selank-calm-protocol',
    name: 'Selank — 11mg / Calm Protocol',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(199), 3: $(399) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'ghk-cu-research-skin',
    name: 'GHK-Cu Research — 50mg / Skin',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 3: $(299), 6: $(580), 12: $(1125) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'mots-c-mitochondrial-reset',
    name: 'Mots-c — 10mg / Mitochondrial Reset',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(249), 3: $(575) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'bpc157-tb500-healing-protocol-plus',
    name: 'BPC157 + TB500 10mg / Healing Protocol Plus',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(299), 3: $(809) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'tesamorelin-20mg-visceral',
    name: 'Tesamorelin 20mg / Visceral Fat Loss',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(299), 3: $(809) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'retatrutide-5mg',
    name: 'Retatrutide 5mg / Comprehensive Fat Loss 5mg',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(299) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
  {
    id: 'retatrutide-10mg',
    name: 'Retatrutide 10mg / Comprehensive Fat Loss 10mg',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(399) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    /** 10mg ships overnight cold — defaults to $30. */
    defaultShippingCents: $(30),
  },
  {
    id: 'retatrutide-20mg',
    name: 'Retatrutide 20mg / Comprehensive Fat Loss 20mg',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(749) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    /** 20mg requires special shipping per pricing sheet. Admin can override. */
    defaultShippingCents: $(30),
  },
  {
    id: 'kisspeptin-fertility-protocol',
    name: 'Kisspeptin / Fertility Protocol',
    category: 'research',
    researchOnly: true,
    retailCentsByTier: { 1: $(249), 3: $(599) },
    costCentsByTier: {},
    defaultConsultCents: $(5),
    defaultShippingCents: $(20),
  },
];

// ---------------------------------------------------------------------------
// Canonical export
// ---------------------------------------------------------------------------

export const OT_PACKAGE_CATALOG: readonly OtPackageCatalogRow[] = [
  ...RX_ROWS,
  ...ADDON_ROWS,
  ...BUNDLE_ROWS,
  ...LAB_ROWS,
  ...RESEARCH_ROWS,
];

const PACKAGE_BY_ID = new Map<string, OtPackageCatalogRow>(
  OT_PACKAGE_CATALOG.map((p) => [p.id, p])
);

export function getOtPackageById(id: string): OtPackageCatalogRow | undefined {
  return PACKAGE_BY_ID.get(id);
}

export interface OtPackageQuoteAtTier {
  retailCents: number;
  costCents: number;
}

/** Returns retail + cost cents at the given tier, or `null` if the package doesn't offer that tier. */
export function getOtPackageQuoteAtTier(
  pkg: OtPackageCatalogRow,
  tier: OtPackageTier
): OtPackageQuoteAtTier | null {
  const retail = pkg.retailCentsByTier[tier];
  const cost = pkg.costCentsByTier[tier];
  if (retail == null && cost == null) return null;
  return { retailCents: retail ?? 0, costCents: cost ?? 0 };
}

/** Tier labels used in the picker UI. */
export const OT_PACKAGE_TIER_LABELS: Record<OtPackageTier, string> = {
  1: '1 month',
  3: '3 month',
  6: '6 month',
  12: '12 month',
};

/** Manual-selection chip values (cents) for the editor. */
export const OT_DOCTOR_CONSULT_CHIPS: Array<{ label: string; cents: number }> = [
  { label: '$0', cents: 0 },
  { label: '$15', cents: 1500 },
  { label: '$30', cents: 3000 },
  { label: '$50', cents: 5000 },
];

export const OT_SHIPPING_CHIPS: Array<{ label: string; cents: number }> = [
  { label: '$0', cents: 0 },
  { label: '$20', cents: 2000 },
  { label: '$30', cents: 3000 },
];

// ---------------------------------------------------------------------------
// Match-by-patient-gross
// ---------------------------------------------------------------------------

/**
 * Lowercase-alphanumeric token split. Words shorter than 3 chars are dropped
 * (keeps strength prefixes like "25" — that's still 3 alphanumerics with a
 * preceding "mg" if the source has "25mg" → ["25mg"]).
 */
function tokenizeForMatch(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Token overlap score between a haystack (package name + subtitle) and a query
 * (Rx description). Exact match = 2 pts; substring match (e.g. "25" inside
 * "25mg") = 1 pt; no match = 0. Each query token contributes at most 2 pts.
 */
function tokenOverlapScore(haystack: string[], query: string[]): number {
  let total = 0;
  for (const q of query) {
    let best = 0;
    for (const h of haystack) {
      if (q === h) {
        best = Math.max(best, 2);
        break;
      } else if (h.includes(q) || q.includes(h)) {
        best = Math.max(best, 1);
      }
    }
    total += best;
  }
  return total;
}

export interface OtPackageMatch {
  pkg: OtPackageCatalogRow;
  tier: OtPackageTier;
  quote: OtPackageQuoteAtTier;
  /** Token-overlap score (higher = more confident name match). */
  score: number;
}

/**
 * Find the package + tier whose retail price matches what the patient paid,
 * disambiguated by name overlap with the order's product description.
 *
 * Used by `buildDefaultOverridePayload` so the editor pre-fills the right
 * pharmacy COGS for the tier the patient actually purchased — e.g. patient
 * paid $249 (1 month Enclomiphene) → pre-fills $45 cost (1 month), not $135
 * (3 month).
 *
 * Returns null when no package has a tier with retail equal to (within the
 * optional tolerance) the gross AND a non-zero name overlap. Caller should
 * fall back to whatever computed defaults they already have.
 */
export function findOtPackageMatchByPatientGross(
  patientGrossCents: number,
  productDescription: string | null | undefined,
  options?: { tolerance?: number }
): OtPackageMatch | null {
  if (patientGrossCents <= 0) return null;
  if (!productDescription || productDescription.trim().length === 0) return null;
  const tolerance = options?.tolerance ?? 0;
  const queryTokens = tokenizeForMatch(productDescription);
  if (queryTokens.length === 0) return null;

  let best: OtPackageMatch | null = null;
  for (const pkg of OT_PACKAGE_CATALOG) {
    const haystack = tokenizeForMatch(`${pkg.name} ${pkg.subtitle ?? ''}`);
    const score = tokenOverlapScore(haystack, queryTokens);
    if (score === 0) continue;

    for (const tier of [1, 3, 6, 12] as OtPackageTier[]) {
      const quote = getOtPackageQuoteAtTier(pkg, tier);
      if (!quote) continue;
      if (quote.retailCents <= 0) continue;
      if (Math.abs(quote.retailCents - patientGrossCents) > tolerance) continue;
      if (!best || score > best.score) {
        best = { pkg, tier, quote, score };
      }
    }
  }
  return best;
}
