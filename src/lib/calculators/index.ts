/**
 * Medical Calculator Utilities
 * 
 * Centralized export for all clinical calculation functions.
 * These utilities are used by both provider and patient portal calculators.
 */

// BMI calculations
export {
  calculateBMI,
  calculateBMIMetric,
  getBMICategory,
  calculateIdealBodyWeight,
  calculateIdealWeightRange,
  getICD10Codes,
  calculateWeightToLose,
  calculatePercentExcessWeight,
  analyzeBMI,
  feetInchesToInches,
  inchesToFeetInches,
  lbsToKg,
  kgToLbs,
  inchesToCm,
  cmToInches,
  BMI_CATEGORIES,
  BMI_ICD10_CODES,
} from './bmi';

export type {
  BMIResult,
  BMICategory,
  BMICategoryInfo,
  ICD10Code,
} from './bmi';

// Cardiovascular risk calculations
export {
  calculateASCVDRisk,
  calculateOptimalRisk,
  getRiskCategory,
  getStatinRecommendation,
  getRecommendations,
  analyzeASCVDRisk,
  validateASCVDInput,
  RISK_CATEGORIES,
  RISK_ENHANCING_FACTORS,
} from './cardiovascular';

export type {
  ASCVDInput,
  ASCVDResult,
  RiskCategory,
  RiskCategoryInfo,
  StatinRecommendation,
} from './cardiovascular';

// Calorie and metabolism calculations
export {
  calculateBMR,
  calculateTDEE,
  getMinimumSafeCalories,
  calculateTargetCalories,
  calculateWeeksToGoal,
  calculateCalorieNeeds,
  calculateMacros as calculateCalorieMacros,
  calculateExerciseCalories,
  getGLP1CalorieAdjustment,
  validateCalorieInput,
  ACTIVITY_LEVELS,
  WEIGHT_LOSS_RATES,
  EXERCISE_MET_VALUES,
} from './calories';

export type {
  CalorieInput,
  CalorieResult,
  MacroTargets as CalorieMacroTargets,
  ActivityLevel,
  ActivityLevelInfo,
  WeightLossRate,
} from './calories';

// GLP-1 medication dosing
export {
  getMedicationInfo,
  unitsToML,
  mlToUnits,
  unitsToMg,
  mgToUnits,
  mgToMl,
  convertDose,
  getUnitsForDose,
  getCurrentTitrationStep,
  getDaysUntilNextDose,
  validateDose,
  getNextInjectionSite,
  calculateVialUsage,
  SEMAGLUTIDE_INFO,
  TIRZEPATIDE_INFO,
  INJECTION_SITES,
  INJECTION_TIPS,
} from './glp1-dosing';

export type {
  GLP1Medication,
  DoseConversionResult,
  TitrationStep,
  ConcentrationOption,
  MedicationInfo,
  InjectionSite,
  InjectionSiteInfo,
} from './glp1-dosing';

// Macronutrient calculations
export {
  getMacroPreset,
  calculateMacros,
  calculateCustomMacros,
  distributeMacrosToMeals,
  getGLP1MacroRecommendations,
  validateMacroInput,
  MACRO_PRESETS,
  CALORIES_PER_GRAM,
  PROTEIN_SOURCES,
} from './macros';

export type {
  MacroGoal,
  MacroRatio,
  MacroGrams,
  MacroCalories,
  MacroResult,
  MacroPreset,
} from './macros';
