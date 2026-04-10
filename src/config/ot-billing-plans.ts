/**
 * OT Men's Health (ot.eonpro.io) billing plans for the invoice dropdown.
 *
 * Prices are USD cents, sourced from the OT pricing spreadsheet (March 2026).
 * Each entry maps to one row in the invoice plan selector and one Product DB row
 * via the `slug` field (stored in Product.metadata.slug after seeding).
 *
 * Stripe Product / Price IDs are included where they exist in the OT Stripe account.
 */

import type { BillingPlan } from './billingPlans';

// ═══════════════════════════════════════════════════════════════════════════
// BLOOD WORK
// ═══════════════════════════════════════════════════════════════════════════

const BLOODWORK: BillingPlan[] = [
  {
    id: 'ot_bloodwork_base',
    name: 'Bloodwork Base Panel',
    category: 'ot_bloodwork',
    price: 10000,
    description: 'Bloodwork Base Panel',
    slug: 'ot_bloodwork_base',
    stripeProductId: 'prod_UDHB3f22droAPV',
    stripePriceId: 'price_1TEqdJDQIH4O9FhrKfKjENt1',
  },
  {
    id: 'ot_bloodwork_full',
    name: 'Bloodwork (Full Panel)',
    category: 'ot_bloodwork',
    price: 20000,
    description: 'Bloodwork (Full Panel)',
    slug: 'ot_bloodwork_full',
    stripeProductId: 'prod_UDHDmjRVdZJdqe',
    stripePriceId: 'price_1TEqemDQIH4O9Fhr17c0s2h8',
  },
  {
    id: 'ot_bloodwork_womens',
    name: 'BLOODWORK (Womens Panel)',
    category: 'ot_bloodwork',
    price: 20000,
    description: 'BLOODWORK (Womens Panel)',
    slug: 'ot_bloodwork_womens',
    stripeProductId: 'prod_UDQkW9dQAtPYL6',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HORMONAL
// ═══════════════════════════════════════════════════════════════════════════

const HORMONAL: BillingPlan[] = [
  // --- TRT Plus ---
  {
    id: 'ot_trt_plus_1mo',
    name: 'TRT Plus – 1 Month',
    category: 'ot_hormonal',
    price: 23900,
    description: 'TRT Plus – 1 Month',
    slug: 'ot_trt_plus_1mo',
    months: 1,
    stripeProductId: 'prod_UDHJqH1tWFUToU',
    stripePriceId: 'price_1TEqlDDQIH4O9FhrehzY0IMe',
  },
  {
    id: 'ot_trt_plus_3mo',
    name: 'TRT Plus – 3 Month',
    category: 'ot_hormonal',
    price: 66900,
    description: 'TRT Plus – 3 Month',
    slug: 'ot_trt_plus_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDHJqH1tWFUToU',
    stripePriceId: 'price_1TEqlDDQIH4O9FhrDutb7KVp',
  },
  {
    id: 'ot_trt_plus_6mo',
    name: 'TRT Plus – 6 Month',
    category: 'ot_hormonal',
    price: 128500,
    description: 'TRT Plus – 6 Month',
    slug: 'ot_trt_plus_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDHJqH1tWFUToU',
    stripePriceId: 'price_1TEqlDDQIH4O9FhrBQvqK4cX',
  },
  {
    id: 'ot_trt_plus_12mo',
    name: 'TRT Plus – 12 Month',
    category: 'ot_hormonal',
    price: 242900,
    description: 'TRT Plus – 12 Month',
    slug: 'ot_trt_plus_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDHJqH1tWFUToU',
    stripePriceId: 'price_1TEqlDDQIH4O9Fhrkk8ZIOft',
  },

  // --- TRT Solo ---
  {
    id: 'ot_trt_solo_1mo',
    name: 'TRT Solo – 1 Month',
    category: 'ot_hormonal',
    price: 16900,
    description: 'TRT Solo – 1 Month',
    slug: 'ot_trt_solo_1mo',
    months: 1,
    stripeProductId: 'prod_UDHOdh5ZUIHbOn',
    stripePriceId: 'TRTSolo1',
  },
  {
    id: 'ot_trt_solo_3mo',
    name: 'TRT Solo – 3 Month',
    category: 'ot_hormonal',
    price: 47000,
    description: 'TRT Solo – 3 Month',
    slug: 'ot_trt_solo_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDHOdh5ZUIHbOn',
    stripePriceId: 'price_1TEqpyDQIH4O9FhrfOwG9HkU',
  },
  {
    id: 'ot_trt_solo_6mo',
    name: 'TRT Solo – 6 Month',
    category: 'ot_hormonal',
    price: 91200,
    description: 'TRT Solo – 6 Month',
    slug: 'ot_trt_solo_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDHOdh5ZUIHbOn',
    stripePriceId: 'price_1TEqpyDQIH4O9FhryYZ7O0Pc',
  },
  {
    id: 'ot_trt_solo_12mo',
    name: 'TRT Solo – 12 Month',
    category: 'ot_hormonal',
    price: 177600,
    description: 'TRT Solo – 12 Month',
    slug: 'ot_trt_solo_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDHOdh5ZUIHbOn',
    stripePriceId: 'TRTSolo12',
  },

  // --- Enclomiphene (Daily) ---
  {
    id: 'ot_enclo_daily_1mo',
    name: 'Enclomiphene (Daily) – 1 Month',
    category: 'ot_hormonal',
    price: 24900,
    description: 'Enclomiphene (Daily) – 1 Month',
    slug: 'ot_enclo_daily_1mo',
    months: 1,
    stripeProductId: 'prod_UDHtGzl85WUJOX',
    stripePriceId: 'price_1TErJGDQIH4O9FhrskaPy3mk',
  },
  {
    id: 'ot_enclo_daily_3mo',
    name: 'Enclomiphene (Daily) – 3 Month',
    category: 'ot_hormonal',
    price: 64900,
    description: 'Enclomiphene (Daily) – 3 Month',
    slug: 'ot_enclo_daily_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDHtGzl85WUJOX',
    stripePriceId: 'price_1TErJGDQIH4O9FhruyiAyply',
  },
  {
    id: 'ot_enclo_daily_6mo',
    name: 'Enclomiphene (Daily) – 6 Month',
    category: 'ot_hormonal',
    price: 127000,
    description: 'Enclomiphene (Daily) – 6 Month',
    slug: 'ot_enclo_daily_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDHtGzl85WUJOX',
    stripePriceId: 'price_1TErJGDQIH4O9Fhrl28Gla6t',
  },
  {
    id: 'ot_enclo_daily_12mo',
    name: 'Enclomiphene (Daily) – 12 Month',
    category: 'ot_hormonal',
    price: 240000,
    description: 'Enclomiphene (Daily) – 12 Month',
    slug: 'ot_enclo_daily_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDHtGzl85WUJOX',
    stripePriceId: 'price_1TEtPCDQIH4O9FhrWkCqvqdU',
  },

  // --- Enclomiphene (Maintenance) ---
  {
    id: 'ot_enclo_maint_1mo',
    name: 'Enclomiphene (Maintenance) – 1 Month',
    category: 'ot_hormonal',
    price: 14900,
    description: 'Enclomiphene (Maintenance) – 1 Month',
    slug: 'ot_enclo_maint_1mo',
    months: 1,
    stripeProductId: 'prod_UDHzUTmU6rVDb6',
    stripePriceId: 'price_1TErPtDQIH4O9FhrXMNRnpcy',
  },
  {
    id: 'ot_enclo_maint_3mo',
    name: 'Enclomiphene (Maintenance) – 3 Month',
    category: 'ot_hormonal',
    price: 37900,
    description: 'Enclomiphene (Maintenance) – 3 Month',
    slug: 'ot_enclo_maint_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDHzUTmU6rVDb6',
    stripePriceId: 'price_1TErPtDQIH4O9FhrG3zYCdJt',
  },
  {
    id: 'ot_enclo_maint_6mo',
    name: 'Enclomiphene (Maintenance) – 6 Month',
    category: 'ot_hormonal',
    price: 73500,
    description: 'Enclomiphene (Maintenance) – 6 Month',
    slug: 'ot_enclo_maint_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDHzUTmU6rVDb6',
    stripePriceId: 'price_1TEtUcDQIH4O9FhrGDmVMOAR',
  },
  {
    id: 'ot_enclo_maint_12mo',
    name: 'Enclomiphene (Maintenance) – 12 Month',
    category: 'ot_hormonal',
    price: 139900,
    description: 'Enclomiphene (Maintenance) – 12 Month',
    slug: 'ot_enclo_maint_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDHzUTmU6rVDb6',
    stripePriceId: 'price_1TEtVbDQIH4O9FhrSMO6DunD',
  },

  // --- HCG ---
  { id: 'ot_hcg_3mo', name: 'HCG – 3 Month', category: 'ot_hormonal', price: 49900, description: 'HCG – 3 Month', slug: 'ot_hcg_3mo', months: 3, isRecurring: true, stripeProductId: 'prod_UDI1iaBNaoVuVN', stripePriceId: 'price_1TErRqDQIH4O9Fhr2Dlv255y' },
  { id: 'ot_hcg_6mo', name: 'HCG – 6 Month', category: 'ot_hormonal', price: 96900, description: 'HCG – 6 Month', slug: 'ot_hcg_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDI1iaBNaoVuVN', stripePriceId: 'price_1TEtdQDQIH4O9Fhrj8i6M0L4' },
  { id: 'ot_hcg_12mo', name: 'HCG – 12 Month', category: 'ot_hormonal', price: 187900, description: 'HCG – 12 Month', slug: 'ot_hcg_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDI1iaBNaoVuVN', stripePriceId: 'price_1TEtdwDQIH4O9FhreLuTaz9k' },

  // --- Anastrozole ---
  {
    id: 'ot_anastrozole_1mo',
    name: 'Anastrozole (any dose 2x weekly) – 1 Month',
    category: 'ot_hormonal',
    price: 6900,
    description: 'Anastrozole (any dose 2x weekly) – 1 Month',
    slug: 'ot_anastrozole_1mo',
    months: 1,
    stripeProductId: 'prod_UDKORZleLZyyVg',
    stripePriceId: 'price_1TEtkADQIH4O9FhrMy7A5WzV',
  },
  {
    id: 'ot_anastrozole_3mo',
    name: 'Anastrozole (any dose 2x weekly) – 3 Month',
    category: 'ot_hormonal',
    price: 9900,
    description: 'Anastrozole (any dose 2x weekly) – 3 Month',
    slug: 'ot_anastrozole_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDKORZleLZyyVg',
    stripePriceId: 'price_1TEtksDQIH4O9FhrT7X8VF57',
  },
  {
    id: 'ot_anastrozole_6mo',
    name: 'Anastrozole (any dose 2x weekly) – 6 Month',
    category: 'ot_hormonal',
    price: 14900,
    description: 'Anastrozole (any dose 2x weekly) – 6 Month',
    slug: 'ot_anastrozole_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDKORZleLZyyVg',
    stripePriceId: 'price_1TEtlNDQIH4O9FhrZGN3X6vw',
  },
  {
    id: 'ot_anastrozole_12mo',
    name: 'Anastrozole (any dose 2x weekly) – 12 Month',
    category: 'ot_hormonal',
    price: 27900,
    description: 'Anastrozole (any dose 2x weekly) – 12 Month',
    slug: 'ot_anastrozole_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDKORZleLZyyVg',
    stripePriceId: 'price_1TEtm9DQIH4O9FhrKS93tIWX',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PRESCRIPTION PEPTIDES
// ═══════════════════════════════════════════════════════════════════════════

const PRESCRIPTION_PEPTIDES: BillingPlan[] = [
  // --- NAD+ ---
  { id: 'ot_nad_1mo', name: 'NAD+ – 1 Month', category: 'ot_prescription_peptides', price: 39900, description: 'NAD+ – 1 Month', slug: 'ot_nad_1mo', months: 1, stripeProductId: 'prod_UDKwccMr7XoJXc', stripePriceId: 'price_1TEuGpDQIH4O9Fhr9aAh9Mh4' },
  { id: 'ot_nad_3mo', name: 'NAD+ – 3 Month', category: 'ot_prescription_peptides', price: 99900, description: 'NAD+ – 3 Month', slug: 'ot_nad_3mo', months: 3, isRecurring: true, stripeProductId: 'prod_UDKwccMr7XoJXc', stripePriceId: 'price_1TEuHWDQIH4O9FhrLJvqubpE' },
  { id: 'ot_nad_6mo', name: 'NAD+ – 6 Month', category: 'ot_prescription_peptides', price: 199800, description: 'NAD+ – 6 Month', slug: 'ot_nad_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDKwccMr7XoJXc', stripePriceId: 'price_1TEuIRDQIH4O9FhrpUWr9Crm' },
  { id: 'ot_nad_12mo', name: 'NAD+ – 12 Month', category: 'ot_prescription_peptides', price: 375000, description: 'NAD+ – 12 Month', slug: 'ot_nad_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDKwccMr7XoJXc', stripePriceId: 'price_1TEuIxDQIH4O9FhryfaSB7Qn' },

  // --- Glutathione ---
  { id: 'ot_glutathione_3mo', name: 'Glutathione – 3 Month', category: 'ot_prescription_peptides', price: 22500, description: 'Glutathione – 3 Month', slug: 'ot_glutathione_3mo', months: 3, isRecurring: true, stripeProductId: 'prod_UDL3n8S4tUzezx', stripePriceId: 'price_1TEuN3DQIH4O9Fhrin80nXB5' },
  { id: 'ot_glutathione_6mo', name: 'Glutathione – 6 Month', category: 'ot_prescription_peptides', price: 42900, description: 'Glutathione – 6 Month', slug: 'ot_glutathione_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDL3n8S4tUzezx', stripePriceId: 'price_1TEuNuDQIH4O9FhrdG9ciPaF' },
  { id: 'ot_glutathione_12mo', name: 'Glutathione – 12 Month', category: 'ot_prescription_peptides', price: 81900, description: 'Glutathione – 12 Month', slug: 'ot_glutathione_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDL3n8S4tUzezx', stripePriceId: 'price_1TEuOpDQIH4O9FhraZ12MDE3' },

  // --- Sermorelin ---
  { id: 'ot_sermorelin_1mo', name: 'Sermorelin – 1 Month', category: 'ot_prescription_peptides', price: 24900, description: 'Sermorelin – 1 Month', slug: 'ot_sermorelin_1mo', months: 1, stripeProductId: 'prod_UDO8iz6pwPraIg', stripePriceId: 'price_1TExMeDQIH4O9FhrctoOO9Vy' },
  { id: 'ot_sermorelin_3mo', name: 'Sermorelin – 3 Month', category: 'ot_prescription_peptides', price: 64900, description: 'Sermorelin – 3 Month', slug: 'ot_sermorelin_3mo', months: 3, isRecurring: true, stripeProductId: 'prod_UDO8iz6pwPraIg', stripePriceId: 'price_1TExNPDQIH4O9FhrYDxGPJ0O' },
  { id: 'ot_sermorelin_6mo', name: 'Sermorelin – 6 Month', category: 'ot_prescription_peptides', price: 125900, description: 'Sermorelin – 6 Month', slug: 'ot_sermorelin_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDO8iz6pwPraIg', stripePriceId: 'price_1TExOFDQIH4O9FhrCbcFanE6' },
  { id: 'ot_sermorelin_12mo', name: 'Sermorelin – 12 Month', category: 'ot_prescription_peptides', price: 250000, description: 'Sermorelin – 12 Month', slug: 'ot_sermorelin_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDO8iz6pwPraIg', stripePriceId: 'price_1TExOZDQIH4O9FhrYKdEuN61' },
];

// ═══════════════════════════════════════════════════════════════════════════
// RESEARCH (USE ONLY – no needles/bac water included)
// ═══════════════════════════════════════════════════════════════════════════

const RESEARCH: BillingPlan[] = [
  // --- Visceral Fat Loss ---
  { id: 'ot_visceral_fat_3mo', name: 'Visceral Fat Loss – 3 Month', category: 'ot_research', price: 80900, description: 'Visceral Fat Loss – 3 Month', slug: 'ot_visceral_fat_3mo', months: 3, stripeProductId: 'prod_UDP0ECQ8EHfq2e', stripePriceId: 'price_1TEyEGDQIH4O9FhrDldjqvKK' },

  // --- Skin ---
  { id: 'ot_skin_cu_3mo', name: 'Skin – 3 Month', category: 'ot_research', price: 29900, description: 'Skin – 3 Month', slug: 'ot_skin_cu_3mo', months: 3, stripeProductId: 'prod_UDPI2OmimpjQzN', stripePriceId: 'price_1TEyU2DQIH4O9Fhr9a2miSKV' },
  { id: 'ot_skin_cu_6mo', name: 'Skin – 6 Month', category: 'ot_research', price: 57500, description: 'Skin – 6 Month', slug: 'ot_skin_cu_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDPI2OmimpjQzN', stripePriceId: 'price_1TEywGDQIH4O9FhrjfrPfowr' },
  { id: 'ot_skin_cu_12mo', name: 'Skin – 12 Month', category: 'ot_research', price: 109900, description: 'Skin – 12 Month', slug: 'ot_skin_cu_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDPI2OmimpjQzN', stripePriceId: 'price_1TEyxkDQIH4O9FhrJiRznm1D' },

  // --- Sun Kissed ---
  { id: 'ot_sun_kissed_3mo', name: 'Sun Kissed – 3 Month', category: 'ot_research', price: 19900, description: 'Sun Kissed – 3 Month', slug: 'ot_sun_kissed_3mo', months: 3, stripeProductId: 'prod_UDPqbr10c25myS', stripePriceId: 'price_1TEz0UDQIH4O9FhrfJ7vgWSW' },

  // --- Platinum Recomp ---
  { id: 'ot_platinum_recomp_1mo', name: 'Platinum Recomp – 1 Month', category: 'ot_research', price: 39900, description: 'Platinum Recomp – 1 Month', slug: 'ot_platinum_recomp_1mo', months: 1, stripeProductId: 'prod_UDPsQ4rq2C2azl', stripePriceId: 'price_1THldMDQIH4O9Fhr7Dtj0RUc' },
  { id: 'ot_platinum_recomp_3mo', name: 'Platinum Recomp – 3 Month', category: 'ot_research', price: 99900, description: 'Platinum Recomp – 3 Month', slug: 'ot_platinum_recomp_3mo', months: 3, stripeProductId: 'prod_UDPsQ4rq2C2azl', stripePriceId: 'price_1TEz2qDQIH4O9FhrNXBc5Kom' },

  // --- Healing Protocol ---
  { id: 'ot_healing_bpc_1mo', name: 'Healing Protocol – 1 Month', category: 'ot_research', price: 20000, description: 'Healing Protocol – 1 Month', slug: 'ot_healing_bpc_1mo', months: 1, stripeProductId: 'prod_UDPv4e15QMvqOT', stripePriceId: 'price_1TEz5oDQIH4O9FhrRJOvFJmQ' },
  { id: 'ot_healing_bpc_3mo', name: 'Healing Protocol – 3 Month', category: 'ot_research', price: 52500, description: 'Healing Protocol – 3 Month', slug: 'ot_healing_bpc_3mo', months: 3, stripeProductId: 'prod_UDPv4e15QMvqOT', stripePriceId: 'price_1TEz71DQIH4O9FhrmVjsijy7' },

  // --- Healing Protocol Plus ---
  { id: 'ot_healing_plus_1mo', name: 'Healing Protocol Plus – 1 Month', category: 'ot_research', price: 29900, description: 'Healing Protocol Plus – 1 Month', slug: 'ot_healing_plus_1mo', months: 1, stripeProductId: 'prod_UDQUBbkcTe5Cal', stripePriceId: 'price_1TEzdLDQIH4O9Fhr7WDxZe9G' },
  { id: 'ot_healing_plus_3mo', name: 'Healing Protocol Plus – 3 Month', category: 'ot_research', price: 80900, description: 'Healing Protocol Plus – 3 Month', slug: 'ot_healing_plus_3mo', months: 3, stripeProductId: 'prod_UDQUBbkcTe5Cal', stripePriceId: 'price_1TEzdkDQIH4O9Fhr1VnTy47y' },

  // --- Longevity Protocol ---
  { id: 'ot_longevity_epithalon', name: 'Longevity Protocol – 2 Week Cycle', category: 'ot_research', price: 52500, description: 'Longevity Protocol – 2 Week Cycle', slug: 'ot_longevity_epithalon', months: 1, stripeProductId: 'prod_UDPyPhxzhd9zJl', stripePriceId: 'price_1TEz8WDQIH4O9FhrBTKnQg6C' },

  // --- Anti-Inflammation ---
  { id: 'ot_anti_inflam_1mo', name: 'Anti-Inflammation – 1 Month', category: 'ot_research', price: 20000, description: 'Anti-Inflammation – 1 Month', slug: 'ot_anti_inflam_1mo', months: 1, stripeProductId: 'prod_UDQ02QiiATMBos', stripePriceId: 'price_1TEzAlDQIH4O9FhrA3B57d5L' },
  { id: 'ot_anti_inflam_3mo', name: 'Anti-Inflammation – 3 Month', category: 'ot_research', price: 52500, description: 'Anti-Inflammation – 3 Month', slug: 'ot_anti_inflam_3mo', months: 3, stripeProductId: 'prod_UDQ02QiiATMBos', stripePriceId: 'price_1TEzEKDQIH4O9FhrWJWTDWUG' },

  // --- Cognition Optimization ---
  { id: 'ot_cognition_semax_1mo', name: 'Cognition Optimization – 1 Month', category: 'ot_research', price: 19900, description: 'Cognition Optimization – 1 Month', slug: 'ot_cognition_semax_1mo', months: 1, stripeProductId: 'prod_UDQ8CW5fUSHczB', stripePriceId: 'price_1TEzIIDQIH4O9FhrCK2pRIoQ' },
  { id: 'ot_cognition_semax_3mo', name: 'Cognition Optimization – 3 Month', category: 'ot_research', price: 39900, description: 'Cognition Optimization – 3 Month', slug: 'ot_cognition_semax_3mo', months: 3, stripeProductId: 'prod_UDQ8CW5fUSHczB', stripePriceId: 'price_1TEzIXDQIH4O9Fhr0RYznAtz' },

  // --- Calm Protocol ---
  { id: 'ot_calm_selank_1mo', name: 'Calm Protocol – 1 Month', category: 'ot_research', price: 19900, description: 'Calm Protocol – 1 Month', slug: 'ot_calm_selank_1mo', months: 1, stripeProductId: 'prod_UDQB7TCKoSIGeh', stripePriceId: 'price_1TEzLQDQIH4O9Fhr8ZG69pyu' },
  { id: 'ot_calm_selank_3mo', name: 'Calm Protocol – 3 Month', category: 'ot_research', price: 39900, description: 'Calm Protocol – 3 Month', slug: 'ot_calm_selank_3mo', months: 3, stripeProductId: 'prod_UDQB7TCKoSIGeh', stripePriceId: 'price_1TEzLxDQIH4O9FhrcXC36vKy' },

  // --- Comprehensive Fat Loss ---
  { id: 'ot_fat_loss_reta_5mg', name: 'Comprehensive Fat Loss – 5mg', category: 'ot_research', price: 29900, description: 'Comprehensive Fat Loss – 5mg', slug: 'ot_fat_loss_reta_5mg', months: 1, stripeProductId: 'prod_UDQEhTtUBoMANC', stripePriceId: 'price_1TEzO5DQIH4O9FhrTK5SGFcv' },
  { id: 'ot_fat_loss_reta_10mg', name: 'Comprehensive Fat Loss – 10mg', category: 'ot_research', price: 39900, description: 'Comprehensive Fat Loss – 10mg', slug: 'ot_fat_loss_reta_10mg', months: 3, stripeProductId: 'prod_UDQEhTtUBoMANC', stripePriceId: 'price_1TEzR3DQIH4O9FhrgIuGQDeN' },
  { id: 'ot_fat_loss_reta_20mg', name: 'Comprehensive Fat Loss – 20mg', category: 'ot_research', price: 74900, description: 'Comprehensive Fat Loss – 20mg', slug: 'ot_fat_loss_reta_20mg', months: 3, stripeProductId: 'prod_UDQEhTtUBoMANC', stripePriceId: 'price_1TEzRQDQIH4O9Fhrt8KV4DPO' },

  // --- Mitochondrial Reset ---
  { id: 'ot_mito_reset_1mo', name: 'Mitochondrial Reset – 1 Month', category: 'ot_research', price: 24900, description: 'Mitochondrial Reset – 1 Month', slug: 'ot_mito_reset_1mo', months: 1, stripeProductId: 'prod_UDQLHm5WUsuZHq', stripePriceId: 'price_1TEzVfDQIH4O9Fhr5zmnJfr8' },
  { id: 'ot_mito_reset_3mo', name: 'Mitochondrial Reset – 3 Month', category: 'ot_research', price: 57500, description: 'Mitochondrial Reset – 3 Month', slug: 'ot_mito_reset_3mo', months: 3, stripeProductId: 'prod_UDQLHm5WUsuZHq', stripePriceId: 'price_1TEzUODQIH4O9FhrpP74TMwP' },

  // --- Recomp Add-On – Ipa Solo ---
  { id: 'ot_recomp_ipa_3mo', name: 'Recomp Add-On – Ipa Solo – 3 Month', category: 'ot_research', price: 49900, description: 'Recomp Add-On – Ipa Solo – 3 Month', slug: 'ot_recomp_ipa_3mo', months: 3, stripeProductId: 'prod_UDQQZCDtv804nG', stripePriceId: 'price_1TEzZwDQIH4O9FhrIKCc7Fiy' },

  // --- Silver Recomp ---
  { id: 'ot_silver_recomp_1mo', name: 'Silver Recomp – 1 Month', category: 'ot_research', price: 29900, description: 'Silver Recomp – 1 Month', slug: 'ot_silver_recomp_1mo', months: 1, stripeProductId: 'prod_UDQXJ3iZwJZGKZ', stripePriceId: 'price_1TEzgNDQIH4O9FhrGyqyUWDH' },
];

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHT LOSS (GLP-1)
// ═══════════════════════════════════════════════════════════════════════════

const WEIGHT_LOSS: BillingPlan[] = [
  { id: 'ot_semaglutide_1mo', name: 'Semaglutide 2.5mg/mL – 1 Month', category: 'ot_weight_loss', price: 29900, description: 'Semaglutide 2.5mg/mL – 1 Month', slug: 'ot_semaglutide_1mo', months: 1 },
  { id: 'ot_semaglutide_3mo', name: 'Semaglutide 2.5mg/mL – 3 Month', category: 'ot_weight_loss', price: 84900, description: 'Semaglutide 2.5mg/mL – 3 Month', slug: 'ot_semaglutide_3mo', months: 3, isRecurring: true },
  {
    id: 'ot_tirzepatide_1mo',
    name: 'Tirzepatide – 1 Month',
    category: 'ot_weight_loss',
    price: 39900,
    description: 'Tirzepatide – 1 Month',
    slug: 'ot_tirzepatide_1mo',
    months: 1,
    stripeProductId: 'prod_UDQabS7aWj2iS4',
    stripePriceId: 'price_1TEzirDQIH4O9FhrPbq6slAl',
  },
  {
    id: 'ot_tirzepatide_3mo',
    name: 'Tirzepatide – 3 Month',
    category: 'ot_weight_loss',
    price: 104900,
    description: 'Tirzepatide – 3 Month',
    slug: 'ot_tirzepatide_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDQabS7aWj2iS4',
    stripePriceId: 'price_1TEzjVDQIH4O9FhrI3S5aXsC',
  },
  {
    id: 'ot_tirzepatide_6mo',
    name: 'Tirzepatide – 6 Month',
    category: 'ot_weight_loss',
    price: 191600,
    description: 'Tirzepatide – 6 Month',
    slug: 'ot_tirzepatide_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDQabS7aWj2iS4',
    stripePriceId: 'price_1TEzk6DQIH4O9Fhri7ZDawI7',
  },
  {
    id: 'ot_tirzepatide_12mo',
    name: 'Tirzepatide – 12 Month',
    category: 'ot_weight_loss',
    price: 360000,
    description: 'Tirzepatide – 12 Month',
    slug: 'ot_tirzepatide_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDQabS7aWj2iS4',
    stripePriceId: 'price_1TEzkeDQIH4O9FhrfhWh1UCd',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// OTHER
// ═══════════════════════════════════════════════════════════════════════════

const OTHER: BillingPlan[] = [
  { id: 'ot_tadalafil_1mo', name: 'Tadalafil 5mg – 1 Month', category: 'ot_other', price: 14900, description: 'Tadalafil 5mg – 1 Month', slug: 'ot_tadalafil_1mo', months: 1, stripePriceId: 'price_1SAG16DQIH4O9Fhrj2A9RBSJ' },
  { id: 'ot_tadalafil_3mo', name: 'Tadalafil 5mg – 3 Month', category: 'ot_other', price: 24900, description: 'Tadalafil 5mg – 3 Month', slug: 'ot_tadalafil_3mo', months: 3, isRecurring: true, stripePriceId: 'price_1SAG1VDQIH4O9FhrgAUE9Z04' },
  { id: 'ot_tadalafil_6mo', name: 'Tadalafil 5mg – 6 Month', category: 'ot_other', price: 49800, description: 'Tadalafil 5mg – 6 Month', slug: 'ot_tadalafil_6mo', months: 6, isRecurring: true, stripePriceId: 'price_1SAG1gDQIH4O9Fhrac6RoK8e' },
  { id: 'ot_ghkcu_cream_1mo', name: 'GHK-Cu 1% Cream – 1 Month', category: 'ot_other', price: 32900, description: 'GHK-Cu 1% Cream – 1 Month', slug: 'ot_ghkcu_cream_1mo', months: 1 },
];

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLES
// ═══════════════════════════════════════════════════════════════════════════

const BUNDLES: BillingPlan[] = [
  // --- Handsome and Wealthy ---
  { id: 'ot_hw_1mo', name: 'Handsome and Wealthy (Enclo and NAD) – 1 Month', category: 'ot_bundles', price: 59900, description: 'Handsome and Wealthy (Enclo and NAD) – 1 Month', slug: 'ot_hw_1mo', months: 1, stripeProductId: 'prod_UDQmnuSWxnTqPs', stripePriceId: 'price_1TEzvEDQIH4O9FhruEEVaFrh' },
  { id: 'ot_hw_3mo', name: 'Handsome and Wealthy (Enclo and NAD) – 3 Month', category: 'ot_bundles', price: 161700, description: 'Handsome and Wealthy (Enclo and NAD) – 3 Month', slug: 'ot_hw_3mo', months: 3, isRecurring: true, stripeProductId: 'prod_UDQmnuSWxnTqPs', stripePriceId: 'price_1TEzwPDQIH4O9FhrdHzABHJl' },
  { id: 'ot_hw_6mo', name: 'Handsome and Wealthy (Enclo and NAD) – 6 Month', category: 'ot_bundles', price: 305300, description: 'Handsome and Wealthy (Enclo and NAD) – 6 Month', slug: 'ot_hw_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDQmnuSWxnTqPs', stripePriceId: 'price_1TEzx9DQIH4O9FhrfynmC6uV' },
  { id: 'ot_hw_12mo', name: 'Handsome and Wealthy (Enclo and NAD) – 12 Month', category: 'ot_bundles', price: 575000, description: 'Handsome and Wealthy (Enclo and NAD) – 12 Month', slug: 'ot_hw_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDQmnuSWxnTqPs', stripePriceId: 'price_1TEzxXDQIH4O9Fhr5TqvQqm5' },

  // --- Build Package ---
  { id: 'ot_build_1mo', name: 'Build Package – Enclo and Sermorelin – 1 Month', category: 'ot_bundles', price: 46900, description: 'Build Package – Enclo and Sermorelin – 1 Month', slug: 'ot_build_1mo', months: 1, stripeProductId: 'prod_UDQqoiKcGO17It', stripePriceId: 'price_1TEzzFDQIH4O9Fhro0VHP4ko' },
  { id: 'ot_build_3mo', name: 'Build Package – Enclo and Sermorelin – 3 Month', category: 'ot_bundles', price: 126800, description: 'Build Package – Enclo and Sermorelin – 3 Month', slug: 'ot_build_3mo', months: 3, isRecurring: true, stripeProductId: 'prod_UDQqoiKcGO17It', stripePriceId: 'price_1TEzzlDQIH4O9Fhrk5npznhz' },
  { id: 'ot_build_6mo', name: 'Build Package – Enclo and Sermorelin – 6 Month', category: 'ot_bundles', price: 239300, description: 'Build Package – Enclo and Sermorelin – 6 Month', slug: 'ot_build_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDQqoiKcGO17It', stripePriceId: 'price_1TF003DQIH4O9FhrUOWithxY' },
  { id: 'ot_build_12mo', name: 'Build Package – Enclo and Sermorelin – 12 Month', category: 'ot_bundles', price: 450000, description: 'Build Package – Enclo and Sermorelin – 12 Month', slug: 'ot_build_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDQqoiKcGO17It', stripePriceId: 'price_1TF00eDQIH4O9FhrglJNMlP6' },

  // --- Build Plus Package ---
  { id: 'ot_buildplus_1mo', name: 'Build Plus Package – Enclo, Sermorelin, Tadalafil – 1 Month', category: 'ot_bundles', price: 54900, description: 'Build Plus Package – Enclo, Sermorelin, Tadalafil – 1 Month', slug: 'ot_buildplus_1mo', months: 1, stripeProductId: 'prod_UDQuhMDeiT6oyH', stripePriceId: 'price_1TF02CDQIH4O9Fhr2SL5f0Ur' },
  { id: 'ot_buildplus_3mo', name: 'Build Plus Package – Enclo, Sermorelin, Tadalafil – 3 Month', category: 'ot_bundles', price: 148200, description: 'Build Plus Package – Enclo, Sermorelin, Tadalafil – 3 Month', slug: 'ot_buildplus_3mo', months: 3, isRecurring: true, stripeProductId: 'prod_UDQuhMDeiT6oyH', stripePriceId: 'price_1TF036DQIH4O9FhrcPW9FiIX' },
  { id: 'ot_buildplus_6mo', name: 'Build Plus Package – Enclo, Sermorelin, Tadalafil – 6 Month', category: 'ot_bundles', price: 280000, description: 'Build Plus Package – Enclo, Sermorelin, Tadalafil – 6 Month', slug: 'ot_buildplus_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDQuhMDeiT6oyH', stripePriceId: 'price_1TF03bDQIH4O9Fhr5TYRw0TD' },
  { id: 'ot_buildplus_12mo', name: 'Build Plus Package – Enclo, Sermorelin, Tadalafil – 12 Month', category: 'ot_bundles', price: 530000, description: 'Build Plus Package – Enclo, Sermorelin, Tadalafil – 12 Month', slug: 'ot_buildplus_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDQuhMDeiT6oyH', stripePriceId: 'price_1TF041DQIH4O9FhrsFuKQHtb' },

  // --- Regen ---
  { id: 'ot_regen_3mo', name: 'Regen – NAD and Glutathione – 3 Month', category: 'ot_bundles', price: 122500, description: 'Regen – NAD and Glutathione – 3 Month', slug: 'ot_regen_3mo', months: 3, isRecurring: true, stripeProductId: 'prod_UDQym7ewYVXKab', stripePriceId: 'price_1TF069DQIH4O9FhruEmD4TFS' },
  { id: 'ot_regen_6mo', name: 'Regen – NAD and Glutathione – 6 Month', category: 'ot_bundles', price: 208200, description: 'Regen – NAD and Glutathione – 6 Month', slug: 'ot_regen_6mo', months: 6, isRecurring: true, stripeProductId: 'prod_UDQym7ewYVXKab', stripePriceId: 'price_1TF06uDQIH4O9FhrFQkbro4k' },
  { id: 'ot_regen_12mo', name: 'Regen – NAD and Glutathione – 12 Month', category: 'ot_bundles', price: 390000, description: 'Regen – NAD and Glutathione – 12 Month', slug: 'ot_regen_12mo', months: 12, isRecurring: true, stripeProductId: 'prod_UDQym7ewYVXKab', stripePriceId: 'price_1TF07yDQIH4O9Fhreck02d6r' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Combined OT catalog
// ═══════════════════════════════════════════════════════════════════════════

export const OT_BILLING_PLANS: BillingPlan[] = [
  ...BLOODWORK,
  ...HORMONAL,
  ...PRESCRIPTION_PEPTIDES,
  ...RESEARCH,
  ...WEIGHT_LOSS,
  ...OTHER,
  ...BUNDLES,
];

/** Category key -> display label for OT plan groups in the invoice dropdown. */
export const OT_CATEGORY_LABELS: Record<string, string> = {
  ot_bloodwork: 'Blood Work',
  ot_hormonal: 'Hormonal',
  ot_prescription_peptides: 'Prescription Peptides',
  ot_research: 'Research (Use Only)',
  ot_weight_loss: 'Weight Loss',
  ot_other: 'Other',
  ot_bundles: 'Bundles',
};
