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
    description: 'Bloodwork (Enclomiphene & HCG) – LH, Total and free testosterone',
    slug: 'ot_bloodwork_base',
    stripeProductId: 'prod_UDHB3f22droAPV',
  },
  {
    id: 'ot_bloodwork_full',
    name: 'Bloodwork Full Panel',
    category: 'ot_bloodwork',
    price: 20000,
    description: 'CBC, CMP, Lipid, Free T3, Total/free testosterone, Estradiol, Prolactin, LH, FSH',
    slug: 'ot_bloodwork_full',
    stripeProductId: 'prod_UDHDmjRVdZJdqe',
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
    description: 'TRT Plus (Test Cyp + Anastrozole + Enclomiphene) – 1 Month',
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
    description: 'TRT Plus (Test Cyp + Anastrozole + Enclomiphene) – 3 Month',
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
    description: 'TRT Plus (Test Cyp + Anastrozole + Enclomiphene) – 6 Month',
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
    description: 'TRT Plus (Test Cyp + Anastrozole + Enclomiphene) – 12 Month',
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
    description: 'TRT Solo (Testosterone Cypionate) – 1 Month',
    slug: 'ot_trt_solo_1mo',
    months: 1,
    stripeProductId: 'prod_UDHOdh5ZUIHbOn',
  },
  {
    id: 'ot_trt_solo_3mo',
    name: 'TRT Solo – 3 Month',
    category: 'ot_hormonal',
    price: 47000,
    description: 'TRT Solo (Testosterone Cypionate) – 3 Month',
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
    description: 'TRT Solo (Testosterone Cypionate) – 6 Month',
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
    description: 'TRT Solo (Testosterone Cypionate) – 12 Month',
    slug: 'ot_trt_solo_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDHOdh5ZUIHbOn',
  },

  // --- Enclomiphene (Daily) ---
  {
    id: 'ot_enclo_daily_1mo',
    name: 'Enclomiphene 25mg Daily – 1 Month',
    category: 'ot_hormonal',
    price: 24900,
    description: 'Enclomiphene 25mg daily (28 tabs) – 1 Month',
    slug: 'ot_enclo_daily_1mo',
    months: 1,
    stripeProductId: 'prod_UDHtGzl85WUJOX',
    stripePriceId: 'price_1TErJGDQIH4O9FhrskaPy3mk',
  },
  {
    id: 'ot_enclo_daily_3mo',
    name: 'Enclomiphene 25mg Daily – 3 Month',
    category: 'ot_hormonal',
    price: 64900,
    description: 'Enclomiphene 25mg daily (84 tabs) – 3 Month',
    slug: 'ot_enclo_daily_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDHtGzl85WUJOX',
    stripePriceId: 'price_1TErJGDQIH4O9FhruyiAyply',
  },
  {
    id: 'ot_enclo_daily_6mo',
    name: 'Enclomiphene 25mg Daily – 6 Month',
    category: 'ot_hormonal',
    price: 127000,
    description: 'Enclomiphene 25mg daily – 6 Month',
    slug: 'ot_enclo_daily_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDHtGzl85WUJOX',
    stripePriceId: 'price_1TErJGDQIH4O9Fhrl28Gla6t',
  },
  {
    id: 'ot_enclo_daily_12mo',
    name: 'Enclomiphene 25mg Daily – 12 Month',
    category: 'ot_hormonal',
    price: 240000,
    description: 'Enclomiphene 25mg daily – 12 Month',
    slug: 'ot_enclo_daily_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDHtGzl85WUJOX',
    stripePriceId: 'price_1TEtPCDQIH4O9FhrWkCqvqdU',
  },

  // --- Enclomiphene (Maintenance) ---
  {
    id: 'ot_enclo_maint_1mo',
    name: 'Enclomiphene Maintenance – 1 Month',
    category: 'ot_hormonal',
    price: 14900,
    description: 'Enclomiphene 25mg MWF (14 tabs) – 1 Month',
    slug: 'ot_enclo_maint_1mo',
    months: 1,
    stripeProductId: 'prod_UDHzUTmU6rVDb6',
    stripePriceId: 'price_1TErPtDQIH4O9FhrXMNRnpcy',
  },
  {
    id: 'ot_enclo_maint_3mo',
    name: 'Enclomiphene Maintenance – 3 Month',
    category: 'ot_hormonal',
    price: 37900,
    description: 'Enclomiphene 25mg MWF (42 tabs) – 3 Month',
    slug: 'ot_enclo_maint_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDHzUTmU6rVDb6',
    stripePriceId: 'price_1TErPtDQIH4O9FhrG3zYCdJt',
  },
  {
    id: 'ot_enclo_maint_6mo',
    name: 'Enclomiphene Maintenance – 6 Month',
    category: 'ot_hormonal',
    price: 73500,
    description: 'Enclomiphene 25mg MWF – 6 Month',
    slug: 'ot_enclo_maint_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDHzUTmU6rVDb6',
    stripePriceId: 'price_1TEtUcDQIH4O9FhrGDmVMOAR',
  },
  {
    id: 'ot_enclo_maint_12mo',
    name: 'Enclomiphene Maintenance – 12 Month',
    category: 'ot_hormonal',
    price: 139900,
    description: 'Enclomiphene 25mg MWF – 12 Month',
    slug: 'ot_enclo_maint_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDHzUTmU6rVDb6',
    stripePriceId: 'price_1TEtVbDQIH4O9FhrSMO6DunD',
  },

  // --- HCG ---
  {
    id: 'ot_hcg_3mo',
    name: 'HCG – 3 Month',
    category: 'ot_hormonal',
    price: 49900,
    description: 'HCG 0.5 mL twice weekly (500 IU) – 3 Month',
    slug: 'ot_hcg_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDI1iaBNaoVuVN',
    stripePriceId: 'price_1TErRqDQIH4O9Fhr2Dlv255y',
  },
  {
    id: 'ot_hcg_6mo',
    name: 'HCG – 6 Month',
    category: 'ot_hormonal',
    price: 96900,
    description: 'HCG 0.5 mL twice weekly (500 IU) – 6 Month',
    slug: 'ot_hcg_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDI1iaBNaoVuVN',
    stripePriceId: 'price_1TEtdQDQIH4O9Fhrj8i6M0L4',
  },
  {
    id: 'ot_hcg_12mo',
    name: 'HCG – 12 Month',
    category: 'ot_hormonal',
    price: 187900,
    description: 'HCG 0.5 mL twice weekly (500 IU) – 12 Month',
    slug: 'ot_hcg_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDI1iaBNaoVuVN',
    stripePriceId: 'price_1TEtdwDQIH4O9FhreLuTaz9k',
  },

  // --- Anastrozole (Add-On) ---
  {
    id: 'ot_anastrozole_1mo',
    name: 'Anastrozole Add-On – 1 Month',
    category: 'ot_hormonal',
    price: 6900,
    description: 'Anastrozole 0.25mg twice weekly (8 tabs) – 1 Month',
    slug: 'ot_anastrozole_1mo',
    months: 1,
    stripeProductId: 'prod_UDKORZleLZyyVg',
    stripePriceId: 'price_1TEtkADQIH4O9FhrMy7A5WzV',
  },
  {
    id: 'ot_anastrozole_3mo',
    name: 'Anastrozole Add-On – 3 Month',
    category: 'ot_hormonal',
    price: 9900,
    description: 'Anastrozole 0.25mg twice weekly (24 tabs) – 3 Month',
    slug: 'ot_anastrozole_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDKORZleLZyyVg',
    stripePriceId: 'price_1TEtksDQIH4O9FhrT7X8VF57',
  },
  {
    id: 'ot_anastrozole_6mo',
    name: 'Anastrozole Add-On – 6 Month',
    category: 'ot_hormonal',
    price: 14900,
    description: 'Anastrozole 0.25mg twice weekly (48 tabs) – 6 Month',
    slug: 'ot_anastrozole_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDKORZleLZyyVg',
    stripePriceId: 'price_1TEtlNDQIH4O9FhrZGN3X6vw',
  },
  {
    id: 'ot_anastrozole_12mo',
    name: 'Anastrozole Add-On – 12 Month',
    category: 'ot_hormonal',
    price: 27900,
    description: 'Anastrozole 0.25mg twice weekly – 12 Month',
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
  {
    id: 'ot_nad_1mo',
    name: 'NAD+ 1000mg – 1 Month',
    category: 'ot_prescription_peptides',
    price: 39900,
    description: 'NAD+ 50 units (50mg) M–F, subcutaneous – 1 Month',
    slug: 'ot_nad_1mo',
    months: 1,
    stripeProductId: 'prod_UDKwccMr7XoJXc',
    stripePriceId: 'price_1TEuGpDQIH4O9Fhr9aAh9Mh4',
  },
  {
    id: 'ot_nad_3mo',
    name: 'NAD+ 1000mg – 3 Month',
    category: 'ot_prescription_peptides',
    price: 99900,
    description: 'NAD+ 50 units (50mg) M–F, subcutaneous – 3 Month',
    slug: 'ot_nad_3mo',
    months: 3,
    isRecurring: true,
    stripeProductId: 'prod_UDKwccMr7XoJXc',
    stripePriceId: 'price_1TEuHWDQIH4O9FhrLJvqubpE',
  },
  {
    id: 'ot_nad_6mo',
    name: 'NAD+ 1000mg – 6 Month',
    category: 'ot_prescription_peptides',
    price: 199800,
    description: 'NAD+ 50 units (50mg) M–F, subcutaneous – 6 Month',
    slug: 'ot_nad_6mo',
    months: 6,
    isRecurring: true,
    stripeProductId: 'prod_UDKwccMr7XoJXc',
    stripePriceId: 'price_1TEuIRDQIH4O9FhrpUWr9Crm',
  },
  {
    id: 'ot_nad_12mo',
    name: 'NAD+ 1000mg – 12 Month',
    category: 'ot_prescription_peptides',
    price: 375000,
    description: 'NAD+ 50 units (50mg) M–F, subcutaneous – 12 Month',
    slug: 'ot_nad_12mo',
    months: 12,
    isRecurring: true,
    stripeProductId: 'prod_UDKwccMr7XoJXc',
    stripePriceId: 'price_1TEuIxDQIH4O9FhryfaSB7Qn',
  },

  // --- Glutathione ---
  {
    id: 'ot_glutathione_3mo',
    name: 'Glutathione 200mg – 3 Month',
    category: 'ot_prescription_peptides',
    price: 22500,
    description: 'Glutathione 50mg MWF (28 units) – 3 Month',
    slug: 'ot_glutathione_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_glutathione_6mo',
    name: 'Glutathione 200mg – 6 Month',
    category: 'ot_prescription_peptides',
    price: 42900,
    description: 'Glutathione 50mg MWF (28 units) – 6 Month',
    slug: 'ot_glutathione_6mo',
    months: 6,
    isRecurring: true,
  },

  // --- Sermorelin ---
  {
    id: 'ot_sermorelin_1mo',
    name: 'Sermorelin 10mg – 1 Month',
    category: 'ot_prescription_peptides',
    price: 24900,
    description: 'Sermorelin 500mcg M–F, subcutaneous – 1 Month',
    slug: 'ot_sermorelin_1mo',
    months: 1,
  },
  {
    id: 'ot_sermorelin_3mo',
    name: 'Sermorelin 10mg – 3 Month',
    category: 'ot_prescription_peptides',
    price: 64900,
    description: 'Sermorelin 500mcg M–F, subcutaneous – 3 Month',
    slug: 'ot_sermorelin_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_sermorelin_6mo',
    name: 'Sermorelin 10mg – 6 Month',
    category: 'ot_prescription_peptides',
    price: 127000,
    description: 'Sermorelin 500mcg M–F, subcutaneous – 6 Month',
    slug: 'ot_sermorelin_6mo',
    months: 6,
    isRecurring: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RESEARCH (USE ONLY – no needles/bac water included)
// ═══════════════════════════════════════════════════════════════════════════

const RESEARCH: BillingPlan[] = [
  // --- Tesamorelin ---
  {
    id: 'ot_tesamorelin_1mo',
    name: 'Tesamorelin 10mg – 1 Month',
    category: 'ot_research',
    price: 29900,
    description: 'Tesamorelin 1mg M–F (2x 10mg/mo) – 1 Month',
    slug: 'ot_tesamorelin_1mo',
    months: 1,
  },
  {
    id: 'ot_tesamorelin_3mo',
    name: 'Tesamorelin 10mg – 3 Month',
    category: 'ot_research',
    price: 80900,
    description: 'Tesamorelin 1mg M–F (2x 10mg/mo) – 3 Month',
    slug: 'ot_tesamorelin_3mo',
    months: 3,
  },

  // --- GHK-Cu Injectable ---
  {
    id: 'ot_ghkcu_inject_3mo',
    name: 'GHK-Cu 50mg Injectable – 3 Month',
    category: 'ot_research',
    price: 29900,
    description: 'GHK-Cu 1mg M–F (2x 50mg vials) – 3 Month',
    slug: 'ot_ghkcu_inject_3mo',
    months: 3,
  },

  // --- BPC/TB-500 Blend ---
  {
    id: 'ot_bpctb_1mo',
    name: 'BPC/TB-500 Blend – 1 Month',
    category: 'ot_research',
    price: 29900,
    description: 'BPC/TB-500 Blend 500mcg M–F (10mg/10mg) – 1 Month',
    slug: 'ot_bpctb_1mo',
    months: 1,
  },
  {
    id: 'ot_bpctb_3mo',
    name: 'BPC/TB-500 Blend – 3 Month',
    category: 'ot_research',
    price: 80900,
    description: 'BPC/TB-500 Blend 500mcg M–F (2x5mg/5mg) – 3 Month',
    slug: 'ot_bpctb_3mo',
    months: 3,
  },

  // --- Melanotan II ---
  {
    id: 'ot_melanotan_3mo',
    name: 'Melanotan II 10mg – 3 Month',
    category: 'ot_research',
    price: 19900,
    description: 'Melanotan II 250mcg daily until desired tan, then maintenance – 3 Month supply',
    slug: 'ot_melanotan_3mo',
    months: 3,
  },

  // --- Tesa + Ipamorelin ---
  {
    id: 'ot_tesaipa_1mo',
    name: 'Tesa + Ipamorelin Blend – 1 Month',
    category: 'ot_research',
    price: 35000,
    description: 'Tesamorelin 500mcg / Ipamorelin 250mcg M–F (10mg/5mg) – 1 Month',
    slug: 'ot_tesaipa_1mo',
    months: 1,
  },
  {
    id: 'ot_tesaipa_3mo',
    name: 'Tesa + Ipamorelin Blend – 3 Month',
    category: 'ot_research',
    price: 99900,
    description: 'Tesamorelin 500mcg / Ipamorelin 250mcg M–F (10mg/5mg) – 3 Month',
    slug: 'ot_tesaipa_3mo',
    months: 3,
  },

  // --- BPC-157 ---
  {
    id: 'ot_bpc157_1mo',
    name: 'BPC-157 10mg – 1 Month',
    category: 'ot_research',
    price: 20000,
    description: 'BPC-157 500mcg M–F (1x 10mg/mo) – 1 Month',
    slug: 'ot_bpc157_1mo',
    months: 1,
  },
  {
    id: 'ot_bpc157_3mo',
    name: 'BPC-157 10mg – 3 Month',
    category: 'ot_research',
    price: 52500,
    description: 'BPC-157 500mcg M–F (1x 10mg/mo) – 3 Month',
    slug: 'ot_bpc157_3mo',
    months: 3,
  },

  // --- Epithalon ---
  {
    id: 'ot_epithalon',
    name: 'Epithalon 50mg – 14 Day Cycle',
    category: 'ot_research',
    price: 52500,
    description: 'Epithalon 10mg daily for 14 days (3x 50mg vials) – once/year cycle',
    slug: 'ot_epithalon',
    months: 1,
  },

  // --- KPV ---
  {
    id: 'ot_kpv_1mo',
    name: 'KPV 10mg – 1 Month',
    category: 'ot_research',
    price: 20000,
    description: 'KPV 500mcg M–F (1x 10mg/mo) – 1 Month',
    slug: 'ot_kpv_1mo',
    months: 1,
  },
  {
    id: 'ot_kpv_3mo',
    name: 'KPV 10mg – 3 Month',
    category: 'ot_research',
    price: 52500,
    description: 'KPV 500mcg M–F (1x 10mg/mo) – 3 Month',
    slug: 'ot_kpv_3mo',
    months: 3,
  },

  // --- Semax ---
  {
    id: 'ot_semax_1mo',
    name: 'Semax 11mg – 1 Month',
    category: 'ot_research',
    price: 19900,
    description: 'Semax 500mcg M–F (1x 10mg vial/mo) – 1 Month',
    slug: 'ot_semax_1mo',
    months: 1,
  },
  {
    id: 'ot_semax_3mo',
    name: 'Semax 11mg – 3 Month',
    category: 'ot_research',
    price: 39900,
    description: 'Semax 500mcg M–F (1x 10mg vial/mo) – 3 Month',
    slug: 'ot_semax_3mo',
    months: 3,
  },

  // --- Selank ---
  {
    id: 'ot_selank_1mo',
    name: 'Selank 11mg – 1 Month',
    category: 'ot_research',
    price: 19900,
    description: 'Selank 500mcg M–F (1x 10mg vial/mo) – 1 Month',
    slug: 'ot_selank_1mo',
    months: 1,
  },
  {
    id: 'ot_selank_3mo',
    name: 'Selank 11mg – 3 Month',
    category: 'ot_research',
    price: 39900,
    description: 'Selank 500mcg M–F (1x 10mg vial/mo) – 3 Month',
    slug: 'ot_selank_3mo',
    months: 3,
  },

  // --- Retatrutide ---
  {
    id: 'ot_reta_20mg_3mo',
    name: 'Retatrutide 20mg – 12 Week Supply',
    category: 'ot_research',
    price: 74900,
    description: 'Retatrutide 20mg – start 1mg, titrate 1mg q2-8wk – 12 week supply',
    slug: 'ot_reta_20mg_3mo',
    months: 3,
  },
  {
    id: 'ot_reta_10mg_3mo',
    name: 'Retatrutide 10mg – 8 Week Supply',
    category: 'ot_research',
    price: 39900,
    description: 'Retatrutide 10mg – start 1mg, titrate 1mg q2-8wk – 8 week supply',
    slug: 'ot_reta_10mg_3mo',
    months: 3,
  },
  {
    id: 'ot_reta_5mg_1mo',
    name: 'Retatrutide 5mg – 5 Week Supply',
    category: 'ot_research',
    price: 29900,
    description: 'Retatrutide 5mg – start 1mg, titrate 1mg q2-8wk – 5 week supply',
    slug: 'ot_reta_5mg_1mo',
    months: 1,
  },

  // --- MOTS-C ---
  {
    id: 'ot_motsc_1mo',
    name: 'MOTS-C 10mg – 1 Month',
    category: 'ot_research',
    price: 24900,
    description: 'MOTS-C 500mcg M–F (1x 10mg) – 1 Month',
    slug: 'ot_motsc_1mo',
    months: 1,
  },
  {
    id: 'ot_motsc_3mo',
    name: 'MOTS-C 10mg – 3 Month',
    category: 'ot_research',
    price: 57500,
    description: 'MOTS-C 500mcg M–F (1x 10mg) – 3 Month',
    slug: 'ot_motsc_3mo',
    months: 3,
  },

  // --- Ipamorelin ---
  {
    id: 'ot_ipamorelin_1mo',
    name: 'Ipamorelin 10mg – 1 Month',
    category: 'ot_research',
    price: 19900,
    description: 'Ipamorelin 250mcg M–F (1x 10mg) – 1 Month',
    slug: 'ot_ipamorelin_1mo',
    months: 1,
  },
  {
    id: 'ot_ipamorelin_3mo',
    name: 'Ipamorelin 10mg – 3 Month',
    category: 'ot_research',
    price: 49900,
    description: 'Ipamorelin 250mcg M–F (1x 10mg) – 3 Month',
    slug: 'ot_ipamorelin_3mo',
    months: 3,
  },

  // --- CJC-1295 with DAC ---
  {
    id: 'ot_cjc1295dac_1mo',
    name: 'CJC-1295 with DAC 5mg – 1 Month',
    category: 'ot_research',
    price: 29900,
    description: 'CJC-1295 with DAC 625mcg twice weekly (5mg) – 1 Month',
    slug: 'ot_cjc1295dac_1mo',
    months: 1,
  },
  {
    id: 'ot_cjc1295dac_3mo',
    name: 'CJC-1295 with DAC 5mg – 3 Month',
    category: 'ot_research',
    price: 80900,
    description: 'CJC-1295 with DAC 625mcg twice weekly (5mg) – 3 Month',
    slug: 'ot_cjc1295dac_3mo',
    months: 3,
  },

  // --- CJC-1295 with Ipamorelin ---
  {
    id: 'ot_cjc1295ipa_1mo',
    name: 'CJC-1295 with Ipamorelin 5mg – 1 Month',
    category: 'ot_research',
    price: 29900,
    description: 'CJC-1295/Ipamorelin 250mcg each M–F (5mg) – 1 Month',
    slug: 'ot_cjc1295ipa_1mo',
    months: 1,
  },
  {
    id: 'ot_cjc1295ipa_3mo',
    name: 'CJC-1295 with Ipamorelin 5mg – 3 Month',
    category: 'ot_research',
    price: 80900,
    description: 'CJC-1295/Ipamorelin 250mcg each M–F (5mg) – 3 Month',
    slug: 'ot_cjc1295ipa_3mo',
    months: 3,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHT LOSS (GLP-1)
// ═══════════════════════════════════════════════════════════════════════════

const WEIGHT_LOSS: BillingPlan[] = [
  {
    id: 'ot_semaglutide_1mo',
    name: 'Semaglutide 2.5mg/mL – 1 Month',
    category: 'ot_weight_loss',
    price: 29900,
    description: 'Semaglutide 2.5mg/mL (1 vial) – 1 Month',
    slug: 'ot_semaglutide_1mo',
    months: 1,
  },
  {
    id: 'ot_semaglutide_3mo',
    name: 'Semaglutide 2.5mg/mL – 3 Month',
    category: 'ot_weight_loss',
    price: 84900,
    description: 'Semaglutide 2.5mg/mL (3 vials) – 3 Month',
    slug: 'ot_semaglutide_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_tirzepatide_1mo',
    name: 'Tirzepatide 10mg/mL – 1 Month',
    category: 'ot_weight_loss',
    price: 39900,
    description: 'Tirzepatide 10mg/mL 2mL (1 vial) – 1 Month',
    slug: 'ot_tirzepatide_1mo',
    months: 1,
  },
  {
    id: 'ot_tirzepatide_3mo',
    name: 'Tirzepatide 10mg/mL – 3 Month',
    category: 'ot_weight_loss',
    price: 104900,
    description: 'Tirzepatide 10mg/mL 2mL (3 vials) – 3 Month',
    slug: 'ot_tirzepatide_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_tirzepatide_6mo',
    name: 'Tirzepatide 10mg/mL – 6 Month',
    category: 'ot_weight_loss',
    price: 191600,
    description: 'Tirzepatide 10mg/mL 2mL – 6 Month',
    slug: 'ot_tirzepatide_6mo',
    months: 6,
    isRecurring: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// OTHER
// ═══════════════════════════════════════════════════════════════════════════

const OTHER: BillingPlan[] = [
  {
    id: 'ot_tadalafil_1mo',
    name: 'Tadalafil 5mg – 1 Month',
    category: 'ot_other',
    price: 14900,
    description: 'Tadalafil 5mg daily (28 tabs) – 1 Month',
    slug: 'ot_tadalafil_1mo',
    months: 1,
  },
  {
    id: 'ot_tadalafil_3mo',
    name: 'Tadalafil 5mg – 3 Month',
    category: 'ot_other',
    price: 24900,
    description: 'Tadalafil 5mg daily (84 tabs) – 3 Month',
    slug: 'ot_tadalafil_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_tadalafil_6mo',
    name: 'Tadalafil 5mg – 6 Month',
    category: 'ot_other',
    price: 49800,
    description: 'Tadalafil 5mg daily – 6 Month',
    slug: 'ot_tadalafil_6mo',
    months: 6,
    isRecurring: true,
  },
  {
    id: 'ot_ghkcu_cream_1mo',
    name: 'GHK-Cu 1% Cream – 1 Month',
    category: 'ot_other',
    price: 32900,
    description: 'GHK-Cu 1% Cream (1 tube) – 1 Month',
    slug: 'ot_ghkcu_cream_1mo',
    months: 1,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLES
// ═══════════════════════════════════════════════════════════════════════════

const BUNDLES: BillingPlan[] = [
  // --- Handsome + Wealthy ---
  {
    id: 'ot_hw_1mo',
    name: 'Handsome + Wealthy – 1 Month',
    category: 'ot_bundles',
    price: 59900,
    description: 'Enclomiphene 25mg + NAD+ 1000mg – 1 Month',
    slug: 'ot_hw_1mo',
    months: 1,
  },
  {
    id: 'ot_hw_3mo',
    name: 'Handsome + Wealthy – 3 Month',
    category: 'ot_bundles',
    price: 161700,
    description: 'Enclomiphene 25mg + NAD+ 1000mg – 3 Month',
    slug: 'ot_hw_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_hw_6mo',
    name: 'Handsome + Wealthy – 6 Month',
    category: 'ot_bundles',
    price: 305300,
    description: 'Enclomiphene 25mg + NAD+ 1000mg – 6 Month',
    slug: 'ot_hw_6mo',
    months: 6,
    isRecurring: true,
  },

  // --- Build ---
  {
    id: 'ot_build_1mo',
    name: 'Build – 1 Month',
    category: 'ot_bundles',
    price: 46900,
    description: 'Enclomiphene + Sermorelin – 1 Month',
    slug: 'ot_build_1mo',
    months: 1,
  },
  {
    id: 'ot_build_3mo',
    name: 'Build – 3 Month',
    category: 'ot_bundles',
    price: 126800,
    description: 'Enclomiphene + Sermorelin – 3 Month',
    slug: 'ot_build_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_build_6mo',
    name: 'Build – 6 Month',
    category: 'ot_bundles',
    price: 239300,
    description: 'Enclomiphene + Sermorelin – 6 Month',
    slug: 'ot_build_6mo',
    months: 6,
    isRecurring: true,
  },

  // --- BuildPlus ---
  {
    id: 'ot_buildplus_1mo',
    name: 'BuildPlus – 1 Month',
    category: 'ot_bundles',
    price: 54900,
    description: 'Enclomiphene + Sermorelin + Tadalafil – 1 Month',
    slug: 'ot_buildplus_1mo',
    months: 1,
  },
  {
    id: 'ot_buildplus_3mo',
    name: 'BuildPlus – 3 Month',
    category: 'ot_bundles',
    price: 148200,
    description: 'Enclomiphene + Sermorelin + Tadalafil – 3 Month',
    slug: 'ot_buildplus_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_buildplus_6mo',
    name: 'BuildPlus – 6 Month',
    category: 'ot_bundles',
    price: 280000,
    description: 'Enclomiphene + Sermorelin + Tadalafil – 6 Month',
    slug: 'ot_buildplus_6mo',
    months: 6,
    isRecurring: true,
  },

  // --- Regen+ ---
  {
    id: 'ot_regen_3mo',
    name: 'Regen+ – 3 Month',
    category: 'ot_bundles',
    price: 122500,
    description: 'NAD+ (3 vials 1000mg) + Glutathione – 3 Month',
    slug: 'ot_regen_3mo',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'ot_regen_6mo',
    name: 'Regen+ – 6 Month',
    category: 'ot_bundles',
    price: 208200,
    description: 'NAD+ (3 vials 1000mg) + Glutathione – 6 Month',
    slug: 'ot_regen_6mo',
    months: 6,
    isRecurring: true,
  },
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
