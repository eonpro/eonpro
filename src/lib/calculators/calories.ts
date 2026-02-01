/**
 * Calorie and Metabolism Calculation Utilities
 * 
 * References:
 * - Mifflin-St Jeor Equation (most accurate for modern populations)
 * - Harris-Benedict Equation (alternative)
 * - ACSM Guidelines for Physical Activity
 */

export interface CalorieInput {
  age: number;
  sex: 'male' | 'female';
  weightLbs: number;
  heightInches: number;
  activityLevel: ActivityLevel;
}

export interface CalorieResult {
  bmr: number; // Basal Metabolic Rate
  tdee: number; // Total Daily Energy Expenditure
  targetCalories: number;
  deficit: number;
  weeksToGoal: number | null;
  monthsToGoal: number | null;
  minimumSafeCalories: number;
  macroTargets?: MacroTargets;
}

export interface MacroTargets {
  protein: { grams: number; calories: number; percentage: number };
  carbs: { grams: number; calories: number; percentage: number };
  fat: { grams: number; calories: number; percentage: number };
}

export type ActivityLevel = 
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export interface ActivityLevelInfo {
  level: ActivityLevel;
  multiplier: number;
  label: string;
  description: string;
  examples: string;
}

export const ACTIVITY_LEVELS: ActivityLevelInfo[] = [
  {
    level: 'sedentary',
    multiplier: 1.2,
    label: 'Sedentary',
    description: 'Little to no exercise',
    examples: 'Desk job, minimal walking',
  },
  {
    level: 'light',
    multiplier: 1.375,
    label: 'Lightly Active',
    description: 'Light exercise 1-3 days/week',
    examples: 'Light walking, casual sports',
  },
  {
    level: 'moderate',
    multiplier: 1.55,
    label: 'Moderately Active',
    description: 'Moderate exercise 3-5 days/week',
    examples: 'Jogging, swimming, cycling',
  },
  {
    level: 'active',
    multiplier: 1.725,
    label: 'Very Active',
    description: 'Hard exercise 6-7 days/week',
    examples: 'Intense workouts, athletic training',
  },
  {
    level: 'very_active',
    multiplier: 1.9,
    label: 'Extra Active',
    description: 'Very hard exercise or physical job',
    examples: 'Professional athlete, construction worker',
  },
];

export interface WeightLossRate {
  lbsPerWeek: number;
  label: string;
  description: string;
  calorieDeficit: number; // Daily deficit needed
}

export const WEIGHT_LOSS_RATES: WeightLossRate[] = [
  {
    lbsPerWeek: 0.5,
    label: '0.5 lb/week',
    description: 'Slow & steady',
    calorieDeficit: 250,
  },
  {
    lbsPerWeek: 1.0,
    label: '1 lb/week',
    description: 'Recommended',
    calorieDeficit: 500,
  },
  {
    lbsPerWeek: 1.5,
    label: '1.5 lb/week',
    description: 'Moderate',
    calorieDeficit: 750,
  },
  {
    lbsPerWeek: 2.0,
    label: '2 lb/week',
    description: 'Aggressive',
    calorieDeficit: 1000,
  },
];

/**
 * Calculate Basal Metabolic Rate using Mifflin-St Jeor Equation
 * This is considered the most accurate formula for modern populations
 */
export function calculateBMR(
  weightLbs: number,
  heightInches: number,
  age: number,
  sex: 'male' | 'female'
): number {
  // Convert to metric
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightInches * 2.54;

  // Mifflin-St Jeor Equation
  // Male: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age(years) + 5
  // Female: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age(years) - 161
  
  let bmr: number;
  if (sex === 'male') {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
  } else {
    bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;
  }

  return Math.round(bmr);
}

/**
 * Calculate Total Daily Energy Expenditure (TDEE)
 * TDEE = BMR × Activity Multiplier
 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const activityInfo = ACTIVITY_LEVELS.find(a => a.level === activityLevel);
  const multiplier = activityInfo?.multiplier || 1.2;
  return Math.round(bmr * multiplier);
}

/**
 * Get minimum safe calorie intake based on sex
 * Based on medical guidelines - do not go below without medical supervision
 */
export function getMinimumSafeCalories(sex: 'male' | 'female'): number {
  return sex === 'male' ? 1500 : 1200;
}

/**
 * Calculate target calories for weight loss
 */
export function calculateTargetCalories(
  tdee: number,
  weightLossRate: number, // lbs per week
  sex: 'male' | 'female'
): number {
  // 3500 calories = 1 pound of fat
  const dailyDeficit = (weightLossRate * 3500) / 7;
  const targetCalories = tdee - dailyDeficit;
  const minimumCalories = getMinimumSafeCalories(sex);
  
  return Math.max(Math.round(targetCalories), minimumCalories);
}

/**
 * Calculate weeks to reach goal weight
 */
export function calculateWeeksToGoal(
  currentWeightLbs: number,
  goalWeightLbs: number,
  weightLossRatePerWeek: number
): number | null {
  if (goalWeightLbs >= currentWeightLbs || weightLossRatePerWeek <= 0) {
    return null;
  }
  
  const weightToLose = currentWeightLbs - goalWeightLbs;
  return Math.ceil(weightToLose / weightLossRatePerWeek);
}

/**
 * Calculate daily calorie needs for a specific goal
 */
export function calculateCalorieNeeds(
  input: CalorieInput,
  goalWeightLbs?: number,
  weightLossRatePerWeek: number = 1.0
): CalorieResult {
  const bmr = calculateBMR(input.weightLbs, input.heightInches, input.age, input.sex);
  const tdee = calculateTDEE(bmr, input.activityLevel);
  const minimumSafe = getMinimumSafeCalories(input.sex);
  
  let targetCalories = tdee;
  let deficit = 0;
  let weeksToGoal: number | null = null;
  let monthsToGoal: number | null = null;

  if (goalWeightLbs && goalWeightLbs < input.weightLbs) {
    targetCalories = calculateTargetCalories(tdee, weightLossRatePerWeek, input.sex);
    deficit = tdee - targetCalories;
    weeksToGoal = calculateWeeksToGoal(input.weightLbs, goalWeightLbs, weightLossRatePerWeek);
    monthsToGoal = weeksToGoal ? Math.ceil(weeksToGoal / 4.33) : null;
  }

  return {
    bmr,
    tdee,
    targetCalories,
    deficit,
    weeksToGoal,
    monthsToGoal,
    minimumSafeCalories: minimumSafe,
  };
}

/**
 * Calculate macronutrient targets based on calories and goals
 */
export function calculateMacros(
  targetCalories: number,
  weightLbs: number,
  goal: 'weight_loss' | 'maintenance' | 'muscle_gain' = 'weight_loss'
): MacroTargets {
  let proteinRatio: number;
  let carbRatio: number;
  let fatRatio: number;

  // Protein recommendations vary by goal
  // Weight loss: Higher protein to preserve muscle (0.8-1.0g per lb body weight)
  // Maintenance: Moderate protein (0.7-0.8g per lb)
  // Muscle gain: High protein (1.0-1.2g per lb)
  
  switch (goal) {
    case 'weight_loss':
      proteinRatio = 0.35; // 35% protein
      carbRatio = 0.35; // 35% carbs
      fatRatio = 0.30; // 30% fat
      break;
    case 'maintenance':
      proteinRatio = 0.25; // 25% protein
      carbRatio = 0.50; // 50% carbs
      fatRatio = 0.25; // 25% fat
      break;
    case 'muscle_gain':
      proteinRatio = 0.30; // 30% protein
      carbRatio = 0.45; // 45% carbs
      fatRatio = 0.25; // 25% fat
      break;
    default:
      proteinRatio = 0.30;
      carbRatio = 0.40;
      fatRatio = 0.30;
  }

  // Calculate calories per macro
  const proteinCals = Math.round(targetCalories * proteinRatio);
  const carbCals = Math.round(targetCalories * carbRatio);
  const fatCals = Math.round(targetCalories * fatRatio);

  // Convert to grams (protein & carbs = 4 cal/g, fat = 9 cal/g)
  const proteinGrams = Math.round(proteinCals / 4);
  const carbGrams = Math.round(carbCals / 4);
  const fatGrams = Math.round(fatCals / 9);

  // Minimum protein based on body weight for weight loss
  const minProteinGrams = Math.round(weightLbs * 0.7);
  const adjustedProteinGrams = Math.max(proteinGrams, minProteinGrams);
  const adjustedProteinCals = adjustedProteinGrams * 4;

  return {
    protein: {
      grams: adjustedProteinGrams,
      calories: adjustedProteinCals,
      percentage: Math.round((adjustedProteinCals / targetCalories) * 100),
    },
    carbs: {
      grams: carbGrams,
      calories: carbCals,
      percentage: Math.round((carbCals / targetCalories) * 100),
    },
    fat: {
      grams: fatGrams,
      calories: fatCals,
      percentage: Math.round((fatCals / targetCalories) * 100),
    },
  };
}

/**
 * Calculate calories burned from exercise
 */
export function calculateExerciseCalories(
  weightLbs: number,
  durationMinutes: number,
  metValue: number // Metabolic Equivalent of Task
): number {
  // Calories = MET × weight (kg) × duration (hours)
  const weightKg = weightLbs * 0.453592;
  const durationHours = durationMinutes / 60;
  return Math.round(metValue * weightKg * durationHours);
}

/**
 * Common exercise MET values
 */
export const EXERCISE_MET_VALUES = {
  walking_slow: 2.5, // 2.5 mph
  walking_moderate: 3.5, // 3.5 mph
  walking_brisk: 4.3, // 4.0 mph
  running_light: 7.0, // 5 mph
  running_moderate: 9.8, // 6 mph
  running_fast: 11.5, // 7.5 mph
  cycling_light: 5.8, // 10-12 mph
  cycling_moderate: 8.0, // 12-14 mph
  swimming_laps: 8.0,
  strength_training: 3.5,
  yoga: 3.0,
  hiit: 9.0,
  elliptical: 5.0,
  rowing: 7.0,
  stair_climbing: 9.0,
  dancing: 4.5,
};

/**
 * GLP-1 medication calorie adjustment recommendations
 * Patients on GLP-1s often need fewer calories due to reduced appetite
 */
export function getGLP1CalorieAdjustment(baseCalories: number): {
  adjusted: number;
  note: string;
} {
  // GLP-1 patients often need 200-400 fewer calories due to reduced appetite
  // but should not go below minimum safe thresholds
  const adjustment = Math.min(300, baseCalories * 0.15);
  
  return {
    adjusted: Math.round(baseCalories - adjustment),
    note: 'GLP-1 medications reduce appetite. If struggling to meet calorie targets, focus on protein-rich foods first.',
  };
}

/**
 * Validate calorie calculation inputs
 */
export function validateCalorieInput(input: Partial<CalorieInput>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.age || input.age < 18 || input.age > 100) {
    errors.push('Age must be between 18 and 100 years');
  }

  if (!input.weightLbs || input.weightLbs < 80 || input.weightLbs > 700) {
    errors.push('Weight must be between 80 and 700 pounds');
  }

  if (!input.heightInches || input.heightInches < 48 || input.heightInches > 96) {
    errors.push('Height must be between 4 feet and 8 feet');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
