/**
 * BMI (Body Mass Index) Calculation Utilities
 * 
 * References:
 * - WHO BMI Classification
 * - CDC Adult BMI Guidelines
 * - Devine Formula for Ideal Body Weight
 */

export interface BMIResult {
  bmi: number;
  category: BMICategory;
  categoryLabel: string;
  idealWeightRange: {
    min: number;
    max: number;
  };
  weightStatus: 'underweight' | 'healthy' | 'overweight' | 'obese';
  icd10Codes: ICD10Code[];
}

export interface ICD10Code {
  code: string;
  description: string;
}

export type BMICategory = 
  | 'severe_underweight'
  | 'underweight'
  | 'healthy'
  | 'overweight'
  | 'obese_class_1'
  | 'obese_class_2'
  | 'obese_class_3';

export interface BMICategoryInfo {
  category: BMICategory;
  label: string;
  range: { min: number; max: number };
  color: string;
  clinicalNotes: string;
}

export const BMI_CATEGORIES: BMICategoryInfo[] = [
  {
    category: 'severe_underweight',
    label: 'Severely Underweight',
    range: { min: 0, max: 16 },
    color: '#3B82F6',
    clinicalNotes: 'May indicate malnutrition or underlying health condition. Consider nutritional assessment.',
  },
  {
    category: 'underweight',
    label: 'Underweight',
    range: { min: 16, max: 18.5 },
    color: '#60A5FA',
    clinicalNotes: 'Consider evaluation for underlying causes. May benefit from nutritional counseling.',
  },
  {
    category: 'healthy',
    label: 'Healthy Weight',
    range: { min: 18.5, max: 25 },
    color: '#10B981',
    clinicalNotes: 'Maintain current lifestyle with balanced diet and regular physical activity.',
  },
  {
    category: 'overweight',
    label: 'Overweight',
    range: { min: 25, max: 30 },
    color: '#F59E0B',
    clinicalNotes: 'Increased risk for cardiovascular disease. Lifestyle modifications recommended.',
  },
  {
    category: 'obese_class_1',
    label: 'Obese Class I',
    range: { min: 30, max: 35 },
    color: '#F97316',
    clinicalNotes: 'Candidate for weight management intervention. Consider GLP-1 therapy eligibility.',
  },
  {
    category: 'obese_class_2',
    label: 'Obese Class II',
    range: { min: 35, max: 40 },
    color: '#EF4444',
    clinicalNotes: 'High risk for comorbidities. Intensive lifestyle intervention and pharmacotherapy recommended.',
  },
  {
    category: 'obese_class_3',
    label: 'Obese Class III',
    range: { min: 40, max: 100 },
    color: '#DC2626',
    clinicalNotes: 'Severe obesity. Consider bariatric surgery referral if pharmacotherapy insufficient.',
  },
];

/**
 * ICD-10 codes related to BMI classifications
 */
export const BMI_ICD10_CODES: Record<string, ICD10Code[]> = {
  underweight: [
    { code: 'R63.6', description: 'Underweight' },
    { code: 'R63.4', description: 'Abnormal weight loss' },
  ],
  overweight: [
    { code: 'E66.3', description: 'Overweight' },
  ],
  obese: [
    { code: 'E66.01', description: 'Morbid (severe) obesity due to excess calories' },
    { code: 'E66.09', description: 'Other obesity due to excess calories' },
    { code: 'E66.1', description: 'Drug-induced obesity' },
    { code: 'E66.9', description: 'Obesity, unspecified' },
    { code: 'Z68.30', description: 'BMI 30.0-30.9, adult' },
    { code: 'Z68.31', description: 'BMI 31.0-31.9, adult' },
    { code: 'Z68.32', description: 'BMI 32.0-32.9, adult' },
    { code: 'Z68.33', description: 'BMI 33.0-33.9, adult' },
    { code: 'Z68.34', description: 'BMI 34.0-34.9, adult' },
    { code: 'Z68.35', description: 'BMI 35.0-35.9, adult' },
    { code: 'Z68.36', description: 'BMI 36.0-36.9, adult' },
    { code: 'Z68.37', description: 'BMI 37.0-37.9, adult' },
    { code: 'Z68.38', description: 'BMI 38.0-38.9, adult' },
    { code: 'Z68.39', description: 'BMI 39.0-39.9, adult' },
    { code: 'Z68.41', description: 'BMI 40.0-44.9, adult' },
    { code: 'Z68.42', description: 'BMI 45.0-49.9, adult' },
    { code: 'Z68.43', description: 'BMI 50.0-59.9, adult' },
    { code: 'Z68.44', description: 'BMI 60.0-69.9, adult' },
    { code: 'Z68.45', description: 'BMI 70 or greater, adult' },
  ],
};

/**
 * Calculate BMI from weight and height
 * @param weightLbs Weight in pounds
 * @param heightInches Height in inches
 * @returns BMI value rounded to 1 decimal place
 */
export function calculateBMI(weightLbs: number, heightInches: number): number {
  if (weightLbs <= 0 || heightInches <= 0) {
    return 0;
  }
  // BMI formula for imperial units: (weight in lbs / height in inches²) × 703
  const bmi = (weightLbs / (heightInches * heightInches)) * 703;
  return Math.round(bmi * 10) / 10;
}

/**
 * Calculate BMI from metric units
 * @param weightKg Weight in kilograms
 * @param heightCm Height in centimeters
 * @returns BMI value rounded to 1 decimal place
 */
export function calculateBMIMetric(weightKg: number, heightCm: number): number {
  if (weightKg <= 0 || heightCm <= 0) {
    return 0;
  }
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}

/**
 * Get BMI category information from BMI value
 */
export function getBMICategory(bmi: number): BMICategoryInfo {
  for (const category of BMI_CATEGORIES) {
    if (bmi >= category.range.min && bmi < category.range.max) {
      return category;
    }
  }
  // Default to healthy if somehow out of range
  return BMI_CATEGORIES.find(c => c.category === 'healthy')!;
}

/**
 * Calculate ideal body weight using Devine formula
 * @param heightInches Height in inches
 * @param sex 'male' or 'female'
 * @returns Ideal body weight in pounds
 */
export function calculateIdealBodyWeight(heightInches: number, sex: 'male' | 'female'): number {
  const heightOver5Feet = Math.max(0, heightInches - 60);
  
  if (sex === 'male') {
    // Devine formula for males: 50 kg + 2.3 kg per inch over 5 feet
    const idealKg = 50 + (2.3 * heightOver5Feet);
    return Math.round(idealKg * 2.20462); // Convert to lbs
  } else {
    // Devine formula for females: 45.5 kg + 2.3 kg per inch over 5 feet
    const idealKg = 45.5 + (2.3 * heightOver5Feet);
    return Math.round(idealKg * 2.20462); // Convert to lbs
  }
}

/**
 * Calculate ideal weight range for healthy BMI (18.5-24.9)
 * @param heightInches Height in inches
 * @returns Weight range in pounds
 */
export function calculateIdealWeightRange(heightInches: number): { min: number; max: number } {
  const heightSquared = heightInches * heightInches;
  return {
    min: Math.round((18.5 * heightSquared) / 703),
    max: Math.round((24.9 * heightSquared) / 703),
  };
}

/**
 * Get relevant ICD-10 codes based on BMI
 */
export function getICD10Codes(bmi: number): ICD10Code[] {
  const codes: ICD10Code[] = [];
  
  if (bmi < 18.5) {
    codes.push(...BMI_ICD10_CODES.underweight);
  } else if (bmi >= 25 && bmi < 30) {
    codes.push(...BMI_ICD10_CODES.overweight);
  } else if (bmi >= 30) {
    // Add general obesity code
    codes.push(BMI_ICD10_CODES.obese[0]); // E66.01
    
    // Add specific BMI Z-code
    const bmiRounded = Math.floor(bmi);
    const zCode = BMI_ICD10_CODES.obese.find(c => {
      if (bmiRounded >= 30 && bmiRounded < 40) {
        return c.code === `Z68.${bmiRounded}`;
      } else if (bmiRounded >= 40 && bmiRounded < 45) {
        return c.code === 'Z68.41';
      } else if (bmiRounded >= 45 && bmiRounded < 50) {
        return c.code === 'Z68.42';
      } else if (bmiRounded >= 50 && bmiRounded < 60) {
        return c.code === 'Z68.43';
      } else if (bmiRounded >= 60 && bmiRounded < 70) {
        return c.code === 'Z68.44';
      } else if (bmiRounded >= 70) {
        return c.code === 'Z68.45';
      }
      return false;
    });
    
    if (zCode) {
      codes.push(zCode);
    }
  }
  
  return codes;
}

/**
 * Calculate weight needed to lose to reach target BMI
 */
export function calculateWeightToLose(
  currentWeightLbs: number,
  heightInches: number,
  targetBMI: number = 25
): number {
  const targetWeight = (targetBMI * heightInches * heightInches) / 703;
  return Math.max(0, Math.round(currentWeightLbs - targetWeight));
}

/**
 * Calculate percent of excess body weight
 */
export function calculatePercentExcessWeight(
  currentWeightLbs: number,
  heightInches: number,
  sex: 'male' | 'female'
): number {
  const idealWeight = calculateIdealBodyWeight(heightInches, sex);
  const excessWeight = currentWeightLbs - idealWeight;
  if (excessWeight <= 0) return 0;
  return Math.round((excessWeight / idealWeight) * 100);
}

/**
 * Get comprehensive BMI analysis
 */
export function analyzeBMI(
  weightLbs: number,
  heightInches: number,
  sex: 'male' | 'female' = 'female'
): BMIResult {
  const bmi = calculateBMI(weightLbs, heightInches);
  const categoryInfo = getBMICategory(bmi);
  
  let weightStatus: BMIResult['weightStatus'];
  if (bmi < 18.5) {
    weightStatus = 'underweight';
  } else if (bmi < 25) {
    weightStatus = 'healthy';
  } else if (bmi < 30) {
    weightStatus = 'overweight';
  } else {
    weightStatus = 'obese';
  }
  
  return {
    bmi,
    category: categoryInfo.category,
    categoryLabel: categoryInfo.label,
    idealWeightRange: calculateIdealWeightRange(heightInches),
    weightStatus,
    icd10Codes: getICD10Codes(bmi),
  };
}

/**
 * Convert height from feet/inches to total inches
 */
export function feetInchesToInches(feet: number, inches: number): number {
  return (feet * 12) + inches;
}

/**
 * Convert inches to feet and inches
 */
export function inchesToFeetInches(totalInches: number): { feet: number; inches: number } {
  return {
    feet: Math.floor(totalInches / 12),
    inches: totalInches % 12,
  };
}

/**
 * Convert pounds to kilograms
 */
export function lbsToKg(lbs: number): number {
  return Math.round(lbs * 0.453592 * 10) / 10;
}

/**
 * Convert kilograms to pounds
 */
export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

/**
 * Convert inches to centimeters
 */
export function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10;
}

/**
 * Convert centimeters to inches
 */
export function cmToInches(cm: number): number {
  return Math.round((cm / 2.54) * 10) / 10;
}
