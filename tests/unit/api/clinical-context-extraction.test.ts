/**
 * Clinical Context Extraction Tests
 * ====================================
 * Tests the logic that parses raw WellMedR intake data (from PatientDocument JSON)
 * into structured clinical context for the prescription queue detail view.
 *
 * This validates the extraction patterns used in
 * src/app/api/provider/prescription-queue/[invoiceId]/route.ts
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Replicate the getField helper used in the route
// ============================================================================

function getField(docJson: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = docJson[k];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return null;
}

// ============================================================================
// Replicate the clinical context extraction logic
// ============================================================================

interface ClinicalContext {
  healthConditions: string[];
  contraindications: string[];
  currentMedications: string | null;
  allergies: string | null;
  vitals: { heightFt: string | null; heightIn: string | null; weightLbs: string | null; bmi: string | null };
  reproductiveStatus: string | null;
  glp1History: { used: boolean; type: string | null; dose: string | null; sideEffects: string | null };
  preferredMedication: string | null;
  thyroidIssues: string | null;
  alcoholUse: string | null;
  exerciseFrequency: string | null;
  weightGoal: string | null;
}

function extractClinicalContext(docJson: Record<string, unknown>): ClinicalContext {
  const ctx: ClinicalContext = {
    healthConditions: [],
    contraindications: [],
    currentMedications: null,
    allergies: null,
    vitals: { heightFt: null, heightIn: null, weightLbs: null, bmi: null },
    reproductiveStatus: null,
    glp1History: { used: false, type: null, dose: null, sideEffects: null },
    preferredMedication: null,
    thyroidIssues: null,
    alcoholUse: null,
    exerciseFrequency: null,
    weightGoal: null,
  };

  const gf = (keys: string[]) => getField(docJson, keys);

  // Health conditions
  const hc1 = gf(['health-conditions', 'healthConditions', 'health_conditions']);
  const hc2 = gf(['health-conditions-2', 'healthConditions2', 'health_conditions_2']);
  if (hc1) ctx.healthConditions.push(...hc1.split(',').map((s) => s.trim()).filter(Boolean));
  if (hc2) ctx.healthConditions.push(...hc2.split(',').map((s) => s.trim()).filter(Boolean));

  // Contraindications
  const pancreatitis = gf(['pancreatitis-history', 'pancreatitisHistory']);
  const men2 = gf(['men2-history', 'men2History', 'MEN2-history']);
  const thyroid = gf(['thyroid-issues', 'thyroidIssues']);
  if (pancreatitis && pancreatitis.toLowerCase() === 'yes') ctx.contraindications.push('History of Pancreatitis');
  if (men2 && men2.toLowerCase() === 'yes') ctx.contraindications.push('MEN2 / Medullary Thyroid Cancer History');
  if (thyroid) ctx.thyroidIssues = thyroid;
  if (thyroid && /cancer|medullary|men2/i.test(thyroid)) ctx.contraindications.push(`Thyroid: ${thyroid}`);

  // Meds & allergies
  ctx.currentMedications = gf(['current-medication', 'currentMedication', 'current_medication', 'medications']);
  ctx.allergies = gf(['allergies', 'drug-allergies', 'drugAllergies', 'medication-allergies']);

  // Vitals
  ctx.vitals.heightFt = gf(['height-ft', 'heightFt', 'height_ft']);
  ctx.vitals.heightIn = gf(['height-in', 'heightIn', 'height_in']);
  ctx.vitals.weightLbs = gf(['current-weight-lbs', 'currentWeightLbs', 'current_weight_lbs', 'weight']);

  const ft = parseFloat(ctx.vitals.heightFt || '');
  const inch = parseFloat(ctx.vitals.heightIn || '0');
  const wt = parseFloat(ctx.vitals.weightLbs || '');
  if (!isNaN(ft) && !isNaN(wt) && ft > 0 && wt > 0) {
    const totalInches = ft * 12 + inch;
    const bmi = (wt / (totalInches * totalInches)) * 703;
    ctx.vitals.bmi = bmi.toFixed(1);
  }

  // Reproductive
  ctx.reproductiveStatus = gf(['pregnant-or-nursing', 'pregnantOrNursing', 'pregnant_or_nursing']);

  // GLP-1
  const glp1Used = gf(['glp1-last-30', 'glp1Last30', 'glp1_last_30']);
  ctx.glp1History.used = glp1Used?.toLowerCase() === 'yes';
  ctx.glp1History.type = gf(['glp1-last-30-medication-type', 'glp1Last30MedicationType']);
  ctx.glp1History.dose = gf(['glp1-last-30-medication-dose-mg', 'glp1Last30MedicationDoseMg']);
  ctx.glp1History.sideEffects = gf(['glp1-side-effects', 'glp1SideEffects', 'glp1_side_effects']);

  // Preference & lifestyle
  ctx.preferredMedication = gf(['preferred-meds', 'preferredMedication', 'preferredMeds', 'medication-preference']);
  ctx.alcoholUse = gf(['alcohol-use', 'alcoholUse', 'alcohol_use']);
  ctx.exerciseFrequency = gf(['exercise-frequency', 'exerciseFrequency', 'exercise_frequency']);
  ctx.weightGoal = gf(['desired-weight-lbs', 'desiredWeightLbs', 'weight-goal', 'weightGoal']);

  return ctx;
}

// ============================================================================
// Tests
// ============================================================================

describe('getField — multi-key lookup', () => {
  it('finds value with first key', () => {
    expect(getField({ 'health-conditions': 'diabetes' }, ['health-conditions', 'healthConditions'])).toBe('diabetes');
  });

  it('falls back to alternate key', () => {
    expect(getField({ healthConditions: 'diabetes' }, ['health-conditions', 'healthConditions'])).toBe('diabetes');
  });

  it('returns null for all missing keys', () => {
    expect(getField({}, ['health-conditions', 'healthConditions'])).toBeNull();
  });

  it('skips empty-string values', () => {
    expect(getField({ 'health-conditions': '', healthConditions: 'hypertension' }, ['health-conditions', 'healthConditions'])).toBe('hypertension');
  });

  it('skips whitespace-only values', () => {
    expect(getField({ 'allergies': '   ', 'drug-allergies': 'Penicillin' }, ['allergies', 'drug-allergies'])).toBe('Penicillin');
  });

  it('trims values', () => {
    expect(getField({ allergies: '  Sulfa drugs  ' }, ['allergies'])).toBe('Sulfa drugs');
  });

  it('converts numeric values to string', () => {
    expect(getField({ 'height-ft': 5 }, ['height-ft'])).toBe('5');
  });
});

describe('Clinical Context — Full intake extraction', () => {
  const fullIntake = {
    'health-conditions': 'Type 2 Diabetes, Hypertension',
    'health-conditions-2': 'PCOS, Sleep Apnea',
    'pancreatitis-history': 'No',
    'men2-history': 'No',
    'thyroid-issues': 'None',
    'current-medication': 'Metformin 500mg, Lisinopril 10mg',
    'allergies': 'Penicillin',
    'height-ft': '5',
    'height-in': '6',
    'current-weight-lbs': '220',
    'pregnant-or-nursing': 'No',
    'glp1-last-30': 'Yes',
    'glp1-last-30-medication-type': 'Semaglutide',
    'glp1-last-30-medication-dose-mg': '0.5',
    'glp1-side-effects': 'Mild nausea',
    'preferred-meds': 'Tirzepatide',
    'alcohol-use': 'Social (1-2 drinks/week)',
    'exercise-frequency': '3-4 times/week',
    'desired-weight-lbs': '160',
  };

  it('extracts all health conditions from both fields', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.healthConditions).toEqual(['Type 2 Diabetes', 'Hypertension', 'PCOS', 'Sleep Apnea']);
  });

  it('has no contraindications when none reported', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.contraindications).toEqual([]);
  });

  it('extracts medications', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.currentMedications).toBe('Metformin 500mg, Lisinopril 10mg');
  });

  it('extracts allergies', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.allergies).toBe('Penicillin');
  });

  it('calculates BMI correctly (5\'6" 220lbs = 35.5)', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.vitals.heightFt).toBe('5');
    expect(ctx.vitals.heightIn).toBe('6');
    expect(ctx.vitals.weightLbs).toBe('220');
    // BMI = (220 / (66*66)) * 703 = (220 / 4356) * 703 = 35.52
    expect(parseFloat(ctx.vitals.bmi!)).toBeCloseTo(35.5, 0);
  });

  it('extracts GLP-1 history', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.glp1History.used).toBe(true);
    expect(ctx.glp1History.type).toBe('Semaglutide');
    expect(ctx.glp1History.dose).toBe('0.5');
    expect(ctx.glp1History.sideEffects).toBe('Mild nausea');
  });

  it('extracts preferred medication', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.preferredMedication).toBe('Tirzepatide');
  });

  it('extracts reproductive status', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.reproductiveStatus).toBe('No');
  });

  it('extracts lifestyle data', () => {
    const ctx = extractClinicalContext(fullIntake);
    expect(ctx.alcoholUse).toBe('Social (1-2 drinks/week)');
    expect(ctx.exerciseFrequency).toBe('3-4 times/week');
    expect(ctx.weightGoal).toBe('160');
  });
});

describe('Clinical Context — Contraindications detection', () => {
  it('flags pancreatitis history', () => {
    const ctx = extractClinicalContext({ 'pancreatitis-history': 'Yes' });
    expect(ctx.contraindications).toContain('History of Pancreatitis');
  });

  it('flags MEN2 history', () => {
    const ctx = extractClinicalContext({ 'men2-history': 'Yes' });
    expect(ctx.contraindications).toContain('MEN2 / Medullary Thyroid Cancer History');
  });

  it('flags thyroid cancer', () => {
    const ctx = extractClinicalContext({ 'thyroid-issues': 'Medullary thyroid carcinoma' });
    expect(ctx.contraindications).toContain('Thyroid: Medullary thyroid carcinoma');
    expect(ctx.thyroidIssues).toBe('Medullary thyroid carcinoma');
  });

  it('flags MEN2 keyword in thyroid issues', () => {
    const ctx = extractClinicalContext({ 'thyroid-issues': 'Family history of MEN2 syndrome' });
    expect(ctx.contraindications).toContain('Thyroid: Family history of MEN2 syndrome');
  });

  it('does not flag normal thyroid issues (e.g., hypothyroidism)', () => {
    const ctx = extractClinicalContext({ 'thyroid-issues': 'Hypothyroidism, on levothyroxine' });
    expect(ctx.contraindications).toHaveLength(0);
    expect(ctx.thyroidIssues).toBe('Hypothyroidism, on levothyroxine');
  });

  it('pancreatitis "no" does not trigger contraindication', () => {
    const ctx = extractClinicalContext({ 'pancreatitis-history': 'No' });
    expect(ctx.contraindications).toHaveLength(0);
  });

  it('accumulates multiple contraindications', () => {
    const ctx = extractClinicalContext({
      'pancreatitis-history': 'Yes',
      'men2-history': 'Yes',
      'thyroid-issues': 'Thyroid cancer',
    });
    expect(ctx.contraindications).toHaveLength(3);
  });
});

describe('Clinical Context — BMI Calculation edge cases', () => {
  it('handles missing height gracefully', () => {
    const ctx = extractClinicalContext({ 'current-weight-lbs': '200' });
    expect(ctx.vitals.bmi).toBeNull();
  });

  it('handles missing weight gracefully', () => {
    const ctx = extractClinicalContext({ 'height-ft': '5', 'height-in': '10' });
    expect(ctx.vitals.bmi).toBeNull();
  });

  it('handles zero height', () => {
    const ctx = extractClinicalContext({ 'height-ft': '0', 'height-in': '0', 'current-weight-lbs': '200' });
    expect(ctx.vitals.bmi).toBeNull();
  });

  it('handles height with no inches (assumed 0)', () => {
    const ctx = extractClinicalContext({ 'height-ft': '6', 'current-weight-lbs': '180' });
    // 6'0" = 72 inches, BMI = (180 / 5184) * 703 = 24.4
    expect(ctx.vitals.bmi).not.toBeNull();
    expect(parseFloat(ctx.vitals.bmi!)).toBeCloseTo(24.4, 0);
  });

  it('handles non-numeric values', () => {
    const ctx = extractClinicalContext({ 'height-ft': 'tall', 'current-weight-lbs': 'heavy' });
    expect(ctx.vitals.bmi).toBeNull();
  });
});

describe('Clinical Context — GLP-1 history edge cases', () => {
  it('glp1-last-30 = "No" → used = false', () => {
    const ctx = extractClinicalContext({ 'glp1-last-30': 'No' });
    expect(ctx.glp1History.used).toBe(false);
  });

  it('glp1-last-30 = "yes" (lowercase) → used = true', () => {
    const ctx = extractClinicalContext({ 'glp1-last-30': 'yes' });
    expect(ctx.glp1History.used).toBe(true);
  });

  it('glp1-last-30 missing → used = false', () => {
    const ctx = extractClinicalContext({});
    expect(ctx.glp1History.used).toBe(false);
  });

  it('glp1 details available even without used flag', () => {
    const ctx = extractClinicalContext({
      'glp1-last-30-medication-type': 'Tirzepatide',
      'glp1-last-30-medication-dose-mg': '2.5',
    });
    expect(ctx.glp1History.type).toBe('Tirzepatide');
    expect(ctx.glp1History.dose).toBe('2.5');
  });
});

describe('Clinical Context — Empty intake document', () => {
  it('returns safe defaults for completely empty intake', () => {
    const ctx = extractClinicalContext({});
    expect(ctx.healthConditions).toEqual([]);
    expect(ctx.contraindications).toEqual([]);
    expect(ctx.currentMedications).toBeNull();
    expect(ctx.allergies).toBeNull();
    expect(ctx.vitals.bmi).toBeNull();
    expect(ctx.reproductiveStatus).toBeNull();
    expect(ctx.glp1History.used).toBe(false);
    expect(ctx.preferredMedication).toBeNull();
    expect(ctx.alcoholUse).toBeNull();
    expect(ctx.exerciseFrequency).toBeNull();
    expect(ctx.weightGoal).toBeNull();
  });
});

describe('Clinical Context — Alternate Airtable key formats (camelCase/snake_case)', () => {
  it('handles camelCase keys', () => {
    const ctx = extractClinicalContext({
      healthConditions: 'Asthma',
      currentMedication: 'Albuterol',
      drugAllergies: 'None',
      pregnantOrNursing: 'No',
      heightFt: '5',
      heightIn: '4',
      currentWeightLbs: '145',
      glp1Last30: 'No',
    });
    expect(ctx.healthConditions).toEqual(['Asthma']);
    expect(ctx.currentMedications).toBe('Albuterol');
    expect(ctx.allergies).toBe('None');
    expect(ctx.reproductiveStatus).toBe('No');
    expect(ctx.vitals.heightFt).toBe('5');
  });

  it('handles snake_case keys', () => {
    const ctx = extractClinicalContext({
      health_conditions: 'GERD',
      current_medication: 'Omeprazole',
      pregnant_or_nursing: 'N/A',
    });
    expect(ctx.healthConditions).toEqual(['GERD']);
    expect(ctx.currentMedications).toBe('Omeprazole');
    expect(ctx.reproductiveStatus).toBe('N/A');
  });
});
