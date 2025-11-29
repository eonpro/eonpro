import { LOGOS_PRODUCTS } from "@/data/logosProducts";

export type SigTemplate = {
  label: string;
  sig: string;
  quantity: string;
  refills: string;
  daysSupply?: number;
};

export type MedicationConfig = {
  id: number;
  name: string;
  strength: string;
  form: string; // normalized code used for defaults + payloads (e.g., CAP/TAB/INJ)
  formLabel?: string; // original vendor label (e.g., Capsule, Troche)
  defaultQuantity?: string;
  defaultRefills?: string;
  defaultSig?: string;
  sigTemplates?: SigTemplate[];
};

const SEMAGLUTIDE_TEMPLATES: SigTemplate[] = [
  {
    label: "Weeks 1-4 · 0.25 mg",
    sig: "Inject 0.25 mg (0.25 mL) subcutaneously once weekly for 4 weeks. Rotate injection sites. Keep refrigerated.",
    quantity: "1",
    refills: "0",
    daysSupply: 28,
  },
  {
    label: "Weeks 5-8 · 0.5 mg",
    sig: "Inject 0.5 mg (0.5 mL) subcutaneously once weekly. Titrate only if tolerated. Rotate injection sites.",
    quantity: "1",
    refills: "0",
    daysSupply: 28,
  },
  {
    label: "Maintenance · 1 mg",
    sig: "Inject 1 mg (1 mL) subcutaneously once weekly. Continue lifestyle counseling and monitor fasting glucose.",
    quantity: "1",
    refills: "1",
    daysSupply: 28,
  },
];

const TIRZEPATIDE_TEMPLATES: SigTemplate[] = [
  {
    label: "Initiation · 2.5 mg",
    sig: "Inject 2.5 mg (0.25 mL) subcutaneously once weekly for 4 weeks to initiate therapy.",
    quantity: "1",
    refills: "0",
  },
  {
    label: "Escalation · 5 mg",
    sig: "Inject 5 mg (0.5 mL) subcutaneously once weekly if patient tolerates initiation dose.",
    quantity: "1",
    refills: "0",
  },
  {
    label: "Maintenance · 10 mg",
    sig: "Inject 10 mg (1 mL) subcutaneously once weekly for maintenance/weight management.",
    quantity: "1",
    refills: "1",
  },
];

const ENCLO_TEMPLATE_DAILY: SigTemplate = {
  label: "Daily 25 mg",
  sig: "Take 1 capsule (25 mg) by mouth each morning with or without food.",
  quantity: "30",
  refills: "2",
};

const ENCLO_TEMPLATE_PULSE: SigTemplate = {
  label: "Pulse · 5 days on / 2 off",
  sig: "Take 1 capsule by mouth daily Monday through Friday, then hold on the weekend.",
  quantity: "20",
  refills: "2",
};

const TESTOSTERONE_TEMPLATES: SigTemplate[] = [
  {
    label: "Weekly 100 mg",
    sig: "Inject 0.5 mL (100 mg) intramuscularly once weekly. Rotate injection sites.",
    quantity: "10",
    refills: "1",
  },
  {
    label: "Biweekly 200 mg",
    sig: "Inject 1 mL (200 mg) intramuscularly every 10-14 days as directed.",
    quantity: "10",
    refills: "1",
  },
];

const ANASTROZOLE_TEMPLATES: SigTemplate[] = [
  {
    label: "0.5 mg twice weekly",
    sig: "Take 1 capsule (0.5 mg) by mouth every Monday and Thursday to manage estradiol.",
    quantity: "24",
    refills: "1",
  },
  {
    label: "0.25 mg M/W/F",
    sig: "Take 1 capsule by mouth every Monday, Wednesday, and Friday.",
    quantity: "40",
    refills: "1",
  },
];

const SERMORELIN_TEMPLATES: SigTemplate[] = [
  {
    label: "Nightly 0.3 mg",
    sig: "Inject 0.3 mg (0.15 mL) subcutaneously nightly before bed on an empty stomach.",
    quantity: "1",
    refills: "1",
  },
  {
    label: "5 nights/week",
    sig: "Inject 0.3 mg subcutaneously nightly Monday through Friday; hold on weekends.",
    quantity: "1",
    refills: "1",
  },
];

type FormCategory = "INJ" | "TAB" | "CAP" | "TROCHE" | "CREAM" | "GEL" | "SWAB" | "OTHER";

function normalizeForm(form: string): { code: FormCategory; label: string } {
  const value = form.toLowerCase();
  if (value.includes("inject")) return { code: "INJ", label: form };
  if (value.includes("capsule")) return { code: "CAP", label: form };
  if (value.includes("tablet")) return { code: "TAB", label: form };
  if (value.includes("troche")) return { code: "TROCHE", label: form };
  if (value.includes("cream")) return { code: "CREAM", label: form };
  if (value.includes("gel")) return { code: "GEL", label: form };
  if (value.includes("swab")) return { code: "SWAB", label: form };
  return { code: "OTHER", label: form };
}

const SPECIAL_CONFIGS: Record<number, Partial<MedicationConfig>> = {
  203449328: { name: "Enclomiphene Citrate 12.5 mg", strength: "12.5 mg", sigTemplates: [ENCLO_TEMPLATE_DAILY, ENCLO_TEMPLATE_PULSE] },
  203449329: { name: "Enclomiphene Citrate 25 mg", strength: "25 mg", sigTemplates: [ENCLO_TEMPLATE_DAILY, ENCLO_TEMPLATE_PULSE] },
  203449330: {
    name: "Enclomiphene Citrate 50 mg",
    strength: "50 mg",
    sigTemplates: [
      {
        label: "Titration · 50 mg qod",
        sig: "Take 1 capsule by mouth every other day. Skip dose if labs show estradiol > 40 pg/mL.",
        quantity: "16",
        refills: "1",
      },
      ENCLO_TEMPLATE_DAILY,
    ],
  },
  203666707: { name: "Anastrozole 0.125 mg", strength: "0.125 mg", sigTemplates: ANASTROZOLE_TEMPLATES },
  203449460: { name: "Anastrozole 0.25 mg", strength: "0.25 mg", sigTemplates: ANASTROZOLE_TEMPLATES },
  203194021: { name: "Anastrozole 0.5 mg", strength: "0.5 mg", sigTemplates: ANASTROZOLE_TEMPLATES },
  203418766: { sigTemplates: [{ label: "Weekly 200 mg", sig: "Inject 1 mL (200 mg) intravenously or as directed once weekly.", quantity: "1", refills: "0" }] },
  203419417: { name: "MIC + B12 Injection (30 mL)", strength: "25/50/50/1 mg/mL" },
  203194055: { name: "NAD+ 100 mg/mL (10 mL)", strength: "100 mg/mL" },
  203448971: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  203448947: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  203449363: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  203448974: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  202851329: { sigTemplates: SEMAGLUTIDE_TEMPLATES },
  203666651: { sigTemplates: SERMORELIN_TEMPLATES },
  203418853: { sigTemplates: SERMORELIN_TEMPLATES },
  203194046: { name: "Sildenafil 55 mg Capsule", strength: "55 mg" },
  203194048: { name: "Sildenafil 110 mg Capsule", strength: "110 mg" },
  203666779: { name: "Sildenafil/Tadalafil 55/11 mg Tablet", strength: "55/11 mg" },
  203666778: { name: "Sildenafil/Tadalafil 110/22 mg Tablet", strength: "110/22 mg" },
  203449567: { name: "Tadalafil 5 mg Tablet", strength: "5 mg" },
  203194052: { name: "Tadalafil/Apomorphine 10/2 mg Capsule", strength: "10/2 mg" },
  202851334: { name: "Testosterone Cypionate 200 mg/mL (10 mL)", sigTemplates: TESTOSTERONE_TEMPLATES },
  203418861: { name: "Testosterone Cypionate 200 mg/mL (5 mL)", sigTemplates: TESTOSTERONE_TEMPLATES },
  203666716: { name: "Testosterone Cypionate 50 mg/mL (2 mL)", sigTemplates: TESTOSTERONE_TEMPLATES },
  203448972: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203448973: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203449364: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203449500: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203449362: { sigTemplates: TIRZEPATIDE_TEMPLATES },
  203418602: { sigTemplates: TIRZEPATIDE_TEMPLATES },
};

export const MEDS: Record<string, MedicationConfig> = {};

LOGOS_PRODUCTS.forEach((product: any) => {
  const { code, label } = normalizeForm(product.form);
  const overrides = SPECIAL_CONFIGS[product.id] ?? {};
  const config: MedicationConfig = {
    id: product.id,
    name: overrides.name ?? product.name,
    strength: overrides.strength ?? (product.strength || ""),
    form: code,
    formLabel: label,
    defaultQuantity: overrides.defaultQuantity,
    defaultRefills: overrides.defaultRefills,
    defaultSig: overrides.defaultSig,
    sigTemplates: overrides.sigTemplates,
  };
  MEDS[String(product.id)] = config;
});
