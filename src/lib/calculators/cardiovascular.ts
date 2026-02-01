/**
 * Cardiovascular Risk Calculation Utilities
 *
 * References:
 * - 2013 ACC/AHA Pooled Cohort Equations for ASCVD Risk
 * - 2018 AHA/ACC Cholesterol Clinical Practice Guidelines
 */

export interface ASCVDInput {
  age: number; // 40-79 years
  sex: 'male' | 'female';
  race: 'white' | 'african_american' | 'other';
  totalCholesterol: number; // mg/dL (130-320)
  hdlCholesterol: number; // mg/dL (20-100)
  systolicBP: number; // mmHg (90-200)
  onHypertensionTreatment: boolean;
  hasDiabetes: boolean;
  isSmoker: boolean;
}

export interface ASCVDResult {
  tenYearRisk: number; // Percentage
  riskCategory: RiskCategory;
  riskCategoryLabel: string;
  optimalRisk: number; // Risk if all factors optimal
  recommendations: string[];
  statinRecommendation: StatinRecommendation;
  lifetimeRisk?: number;
}

export type RiskCategory = 'low' | 'borderline' | 'intermediate' | 'high';

export interface StatinRecommendation {
  indicated: boolean;
  intensity: 'none' | 'moderate' | 'high';
  rationale: string;
}

export interface RiskCategoryInfo {
  category: RiskCategory;
  label: string;
  range: { min: number; max: number };
  color: string;
  description: string;
}

export const RISK_CATEGORIES: RiskCategoryInfo[] = [
  {
    category: 'low',
    label: 'Low Risk',
    range: { min: 0, max: 5 },
    color: '#10B981',
    description: 'Continue healthy lifestyle. Reassess in 5-10 years.',
  },
  {
    category: 'borderline',
    label: 'Borderline Risk',
    range: { min: 5, max: 7.5 },
    color: '#F59E0B',
    description: 'Emphasize lifestyle modifications. Consider risk-enhancing factors.',
  },
  {
    category: 'intermediate',
    label: 'Intermediate Risk',
    range: { min: 7.5, max: 20 },
    color: '#F97316',
    description:
      'Lifestyle therapy and consider moderate-intensity statin if risk enhancers present.',
  },
  {
    category: 'high',
    label: 'High Risk',
    range: { min: 20, max: 100 },
    color: '#EF4444',
    description: 'Intensive lifestyle therapy and high-intensity statin therapy recommended.',
  },
];

/**
 * Pooled Cohort Equations coefficients
 * Source: 2013 ACC/AHA Cardiovascular Risk Assessment Guideline
 */
const PCE_COEFFICIENTS = {
  white_male: {
    ln_age: 12.344,
    ln_age_sq: 0,
    ln_total_chol: 11.853,
    ln_age_x_ln_total_chol: -2.664,
    ln_hdl: -7.99,
    ln_age_x_ln_hdl: 1.769,
    ln_treated_sbp: 1.797,
    ln_untreated_sbp: 1.764,
    ln_age_x_ln_sbp: 0, // Not used for white males
    smoker: 7.837,
    ln_age_x_smoker: -1.795,
    diabetes: 0.658,
    baseline_survival: 0.9144,
    mean_coef: 61.18,
  },
  white_female: {
    ln_age: -29.799,
    ln_age_sq: 4.884,
    ln_total_chol: 13.54,
    ln_age_x_ln_total_chol: -3.114,
    ln_hdl: -13.578,
    ln_age_x_ln_hdl: 3.149,
    ln_treated_sbp: 2.019,
    ln_untreated_sbp: 1.957,
    ln_age_x_ln_sbp: 0,
    smoker: 7.574,
    ln_age_x_smoker: -1.665,
    diabetes: 0.661,
    baseline_survival: 0.9665,
    mean_coef: -29.18,
  },
  african_american_male: {
    ln_age: 2.469,
    ln_age_sq: 0,
    ln_total_chol: 0.302,
    ln_age_x_ln_total_chol: 0,
    ln_hdl: -0.307,
    ln_age_x_ln_hdl: 0,
    ln_treated_sbp: 1.916,
    ln_untreated_sbp: 1.809,
    ln_age_x_ln_sbp: 0,
    smoker: 0.549,
    ln_age_x_smoker: 0,
    diabetes: 0.645,
    baseline_survival: 0.8954,
    mean_coef: 19.54,
  },
  african_american_female: {
    ln_age: 17.114,
    ln_age_sq: 0,
    ln_total_chol: 0.94,
    ln_age_x_ln_total_chol: 0,
    ln_hdl: -18.92,
    ln_age_x_ln_hdl: 4.475,
    ln_treated_sbp: 29.291,
    ln_untreated_sbp: 27.82,
    ln_age_x_ln_sbp: -6.432,
    smoker: 0.691,
    ln_age_x_smoker: 0,
    diabetes: 0.874,
    baseline_survival: 0.9533,
    mean_coef: 86.61,
  },
};

/**
 * Calculate 10-year ASCVD risk using Pooled Cohort Equations
 */
export function calculateASCVDRisk(input: ASCVDInput): number {
  // Validate inputs
  if (input.age < 40 || input.age > 79) {
    return -1; // Invalid age range
  }

  // Determine coefficient set based on race and sex
  let coeffKey: keyof typeof PCE_COEFFICIENTS;
  if (input.race === 'african_american') {
    coeffKey = input.sex === 'male' ? 'african_american_male' : 'african_american_female';
  } else {
    // White and other races use white coefficients
    coeffKey = input.sex === 'male' ? 'white_male' : 'white_female';
  }

  const coef = PCE_COEFFICIENTS[coeffKey];

  // Calculate natural logs
  const lnAge = Math.log(input.age);
  const lnTotalChol = Math.log(input.totalCholesterol);
  const lnHDL = Math.log(input.hdlCholesterol);
  const lnSBP = Math.log(input.systolicBP);

  // Calculate individual sum
  let sum = 0;

  sum += coef.ln_age * lnAge;
  sum += coef.ln_age_sq * (lnAge * lnAge);
  sum += coef.ln_total_chol * lnTotalChol;
  sum += coef.ln_age_x_ln_total_chol * (lnAge * lnTotalChol);
  sum += coef.ln_hdl * lnHDL;
  sum += coef.ln_age_x_ln_hdl * (lnAge * lnHDL);

  if (input.onHypertensionTreatment) {
    sum += coef.ln_treated_sbp * lnSBP;
  } else {
    sum += coef.ln_untreated_sbp * lnSBP;
  }

  // Age x SBP interaction (for AA females)
  if (coef.ln_age_x_ln_sbp !== 0) {
    if (input.onHypertensionTreatment) {
      sum += coef.ln_age_x_ln_sbp * lnAge * lnSBP;
    } else {
      sum += coef.ln_age_x_ln_sbp * lnAge * lnSBP;
    }
  }

  if (input.isSmoker) {
    sum += coef.smoker;
    sum += coef.ln_age_x_smoker * lnAge;
  }

  if (input.hasDiabetes) {
    sum += coef.diabetes;
  }

  // Calculate 10-year risk
  const risk = 1 - Math.pow(coef.baseline_survival, Math.exp(sum - coef.mean_coef));

  // Convert to percentage and round to 1 decimal
  return Math.round(risk * 1000) / 10;
}

/**
 * Calculate optimal 10-year risk (all modifiable factors optimal)
 */
export function calculateOptimalRisk(input: ASCVDInput): number {
  const optimalInput: ASCVDInput = {
    ...input,
    totalCholesterol: 170, // Optimal total cholesterol
    hdlCholesterol: 50, // Optimal HDL
    systolicBP: 110, // Optimal SBP
    onHypertensionTreatment: false,
    hasDiabetes: false,
    isSmoker: false,
  };

  return calculateASCVDRisk(optimalInput);
}

/**
 * Get risk category based on 10-year ASCVD risk percentage
 */
export function getRiskCategory(riskPercentage: number): RiskCategoryInfo {
  for (const category of RISK_CATEGORIES) {
    if (riskPercentage >= category.range.min && riskPercentage < category.range.max) {
      return category;
    }
  }
  return RISK_CATEGORIES[RISK_CATEGORIES.length - 1]; // High risk
}

/**
 * Get statin therapy recommendation based on risk
 */
export function getStatinRecommendation(
  riskPercentage: number,
  hasLDLOver190: boolean = false,
  hasDiabetes: boolean = false,
  age: number = 50
): StatinRecommendation {
  // Primary prevention high-risk groups
  if (hasLDLOver190) {
    return {
      indicated: true,
      intensity: 'high',
      rationale: 'LDL-C ≥190 mg/dL - High-intensity statin indicated regardless of ASCVD risk.',
    };
  }

  if (hasDiabetes && age >= 40 && age <= 75) {
    if (riskPercentage >= 20) {
      return {
        indicated: true,
        intensity: 'high',
        rationale: 'Diabetes with high ASCVD risk (≥20%) - High-intensity statin recommended.',
      };
    }
    return {
      indicated: true,
      intensity: 'moderate',
      rationale: 'Diabetes age 40-75 - Moderate-intensity statin recommended.',
    };
  }

  // Risk-based recommendations
  if (riskPercentage >= 20) {
    return {
      indicated: true,
      intensity: 'high',
      rationale:
        'High ASCVD risk (≥20%) - High-intensity statin recommended to reduce LDL-C by ≥50%.',
    };
  }

  if (riskPercentage >= 7.5) {
    return {
      indicated: true,
      intensity: 'moderate',
      rationale:
        'Intermediate risk (7.5-20%) - Moderate-intensity statin recommended. Consider risk enhancers.',
    };
  }

  if (riskPercentage >= 5) {
    return {
      indicated: false,
      intensity: 'none',
      rationale: 'Borderline risk (5-7.5%) - Consider statin if risk-enhancing factors present.',
    };
  }

  return {
    indicated: false,
    intensity: 'none',
    rationale: 'Low risk (<5%) - Focus on lifestyle modifications. Reassess risk in 5-10 years.',
  };
}

/**
 * Get lifestyle recommendations based on risk factors
 */
export function getRecommendations(input: ASCVDInput, riskPercentage: number): string[] {
  const recommendations: string[] = [];

  // Universal recommendations
  recommendations.push(
    'Heart-healthy diet (emphasize vegetables, fruits, whole grains, lean proteins)'
  );
  recommendations.push(
    'Regular physical activity (150+ minutes moderate or 75+ minutes vigorous per week)'
  );
  recommendations.push('Maintain healthy weight (BMI 18.5-24.9)');

  // Smoking
  if (input.isSmoker) {
    recommendations.push('Smoking cessation - highest priority modifiable risk factor');
  }

  // Blood pressure
  if (input.systolicBP >= 130) {
    recommendations.push('Blood pressure management - target <130/80 mmHg');
    if (input.systolicBP >= 140) {
      recommendations.push('Consider antihypertensive medication if not already prescribed');
    }
  }

  // Cholesterol
  if (input.totalCholesterol >= 200) {
    recommendations.push('Cholesterol management - reduce saturated fat intake');
  }
  if (input.hdlCholesterol < 40) {
    recommendations.push('Increase HDL through exercise, weight loss, and omega-3 fatty acids');
  }

  // Diabetes
  if (input.hasDiabetes) {
    recommendations.push('Optimal glycemic control - target HbA1c per individual goals');
  }

  // High risk
  if (riskPercentage >= 7.5) {
    recommendations.push('Consider aspirin therapy after risk-benefit discussion (if age 40-70)');
  }

  return recommendations;
}

/**
 * Get comprehensive ASCVD analysis
 */
export function analyzeASCVDRisk(input: ASCVDInput): ASCVDResult {
  const tenYearRisk = calculateASCVDRisk(input);
  const optimalRisk = calculateOptimalRisk(input);
  const categoryInfo = getRiskCategory(tenYearRisk);
  const statinRec = getStatinRecommendation(tenYearRisk, false, input.hasDiabetes, input.age);
  const recommendations = getRecommendations(input, tenYearRisk);

  return {
    tenYearRisk,
    riskCategory: categoryInfo.category,
    riskCategoryLabel: categoryInfo.label,
    optimalRisk,
    recommendations,
    statinRecommendation: statinRec,
  };
}

/**
 * Risk-enhancing factors to consider for borderline/intermediate risk patients
 */
export const RISK_ENHANCING_FACTORS = [
  'Family history of premature ASCVD (males <55, females <65 years)',
  'Persistently elevated LDL-C ≥160 mg/dL',
  'Metabolic syndrome',
  'Chronic kidney disease (eGFR 15-59 mL/min/1.73m²)',
  'Chronic inflammatory conditions (RA, psoriasis, HIV)',
  'History of premature menopause (<40 years)',
  'History of pregnancy-associated conditions (preeclampsia, gestational diabetes)',
  'High-risk ethnicity (e.g., South Asian ancestry)',
  'Persistently elevated triglycerides ≥175 mg/dL',
  'Elevated high-sensitivity C-reactive protein (≥2.0 mg/L)',
  'Elevated Lp(a) ≥50 mg/dL or ≥125 nmol/L',
  'Elevated apoB ≥130 mg/dL',
  'Ankle-brachial index <0.9',
];

/**
 * Validate ASCVD input parameters
 */
export function validateASCVDInput(input: Partial<ASCVDInput>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input.age || input.age < 40 || input.age > 79) {
    errors.push('Age must be between 40 and 79 years');
  }

  if (!input.totalCholesterol || input.totalCholesterol < 130 || input.totalCholesterol > 320) {
    errors.push('Total cholesterol must be between 130 and 320 mg/dL');
  }

  if (!input.hdlCholesterol || input.hdlCholesterol < 20 || input.hdlCholesterol > 100) {
    errors.push('HDL cholesterol must be between 20 and 100 mg/dL');
  }

  if (!input.systolicBP || input.systolicBP < 90 || input.systolicBP > 200) {
    errors.push('Systolic blood pressure must be between 90 and 200 mmHg');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
