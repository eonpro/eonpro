/**
 * Macronutrient Calculation Utilities
 * 
 * References:
 * - Dietary Guidelines for Americans
 * - ACSM Protein Recommendations
 * - ADA Nutrition Therapy Guidelines
 */

export type MacroGoal = 'weight_loss' | 'maintenance' | 'muscle_gain' | 'keto' | 'low_carb' | 'balanced';

export interface MacroRatio {
  protein: number; // percentage (0-100)
  carbs: number; // percentage (0-100)
  fat: number; // percentage (0-100)
}

export interface MacroGrams {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface MacroCalories {
  protein: number;
  carbs: number;
  fat: number;
  total: number;
}

export interface MacroResult {
  calories: MacroCalories;
  grams: MacroGrams;
  percentages: MacroRatio;
  recommendations: string[];
}

export interface MacroPreset {
  goal: MacroGoal;
  label: string;
  description: string;
  ratio: MacroRatio;
  proteinPerLb: number; // grams per pound of body weight
  fiberTarget: number; // grams per 1000 calories
}

/**
 * Macro presets for different dietary goals
 */
export const MACRO_PRESETS: MacroPreset[] = [
  {
    goal: 'weight_loss',
    label: 'Weight Loss',
    description: 'High protein to preserve muscle, moderate carbs and fats',
    ratio: { protein: 35, carbs: 35, fat: 30 },
    proteinPerLb: 0.8,
    fiberTarget: 14,
  },
  {
    goal: 'maintenance',
    label: 'Maintenance',
    description: 'Balanced macros for maintaining current weight',
    ratio: { protein: 25, carbs: 50, fat: 25 },
    proteinPerLb: 0.7,
    fiberTarget: 14,
  },
  {
    goal: 'muscle_gain',
    label: 'Muscle Gain',
    description: 'High protein and carbs to support muscle growth',
    ratio: { protein: 30, carbs: 45, fat: 25 },
    proteinPerLb: 1.0,
    fiberTarget: 14,
  },
  {
    goal: 'keto',
    label: 'Ketogenic',
    description: 'Very low carb, high fat for ketosis',
    ratio: { protein: 25, carbs: 5, fat: 70 },
    proteinPerLb: 0.8,
    fiberTarget: 10,
  },
  {
    goal: 'low_carb',
    label: 'Low Carb',
    description: 'Reduced carbs, higher protein and fat',
    ratio: { protein: 30, carbs: 20, fat: 50 },
    proteinPerLb: 0.8,
    fiberTarget: 12,
  },
  {
    goal: 'balanced',
    label: 'Balanced',
    description: 'Standard balanced diet following dietary guidelines',
    ratio: { protein: 20, carbs: 50, fat: 30 },
    proteinPerLb: 0.6,
    fiberTarget: 14,
  },
];

/**
 * Calorie content per gram of each macronutrient
 */
export const CALORIES_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
  alcohol: 7,
};

/**
 * Get macro preset by goal
 */
export function getMacroPreset(goal: MacroGoal): MacroPreset {
  return MACRO_PRESETS.find(p => p.goal === goal) || MACRO_PRESETS[0];
}

/**
 * Calculate macros based on calorie target and preset
 */
export function calculateMacros(
  targetCalories: number,
  goal: MacroGoal,
  bodyWeightLbs?: number
): MacroResult {
  const preset = getMacroPreset(goal);
  
  // Calculate calories from each macro
  const proteinCalories = Math.round(targetCalories * (preset.ratio.protein / 100));
  const carbCalories = Math.round(targetCalories * (preset.ratio.carbs / 100));
  const fatCalories = Math.round(targetCalories * (preset.ratio.fat / 100));
  
  // Convert to grams
  let proteinGrams = Math.round(proteinCalories / CALORIES_PER_GRAM.protein);
  const carbGrams = Math.round(carbCalories / CALORIES_PER_GRAM.carbs);
  const fatGrams = Math.round(fatCalories / CALORIES_PER_GRAM.fat);
  
  // Adjust protein based on body weight if provided
  if (bodyWeightLbs) {
    const minProtein = Math.round(bodyWeightLbs * preset.proteinPerLb);
    proteinGrams = Math.max(proteinGrams, minProtein);
  }
  
  // Calculate fiber target
  const fiberGrams = Math.round((targetCalories / 1000) * preset.fiberTarget);
  
  // Generate recommendations
  const recommendations = generateMacroRecommendations(goal, {
    protein: proteinGrams,
    carbs: carbGrams,
    fat: fatGrams,
    fiber: fiberGrams,
  });
  
  return {
    calories: {
      protein: proteinGrams * CALORIES_PER_GRAM.protein,
      carbs: carbGrams * CALORIES_PER_GRAM.carbs,
      fat: fatGrams * CALORIES_PER_GRAM.fat,
      total: targetCalories,
    },
    grams: {
      protein: proteinGrams,
      carbs: carbGrams,
      fat: fatGrams,
      fiber: fiberGrams,
    },
    percentages: preset.ratio,
    recommendations,
  };
}

/**
 * Calculate custom macros from user-specified ratios
 */
export function calculateCustomMacros(
  targetCalories: number,
  proteinPercent: number,
  carbPercent: number,
  fatPercent: number
): MacroResult {
  // Validate percentages sum to 100
  const total = proteinPercent + carbPercent + fatPercent;
  if (Math.abs(total - 100) > 1) {
    // Normalize if not close to 100
    const factor = 100 / total;
    proteinPercent *= factor;
    carbPercent *= factor;
    fatPercent *= factor;
  }
  
  const proteinCalories = Math.round(targetCalories * (proteinPercent / 100));
  const carbCalories = Math.round(targetCalories * (carbPercent / 100));
  const fatCalories = Math.round(targetCalories * (fatPercent / 100));
  
  const proteinGrams = Math.round(proteinCalories / CALORIES_PER_GRAM.protein);
  const carbGrams = Math.round(carbCalories / CALORIES_PER_GRAM.carbs);
  const fatGrams = Math.round(fatCalories / CALORIES_PER_GRAM.fat);
  const fiberGrams = Math.round((targetCalories / 1000) * 14);
  
  return {
    calories: {
      protein: proteinCalories,
      carbs: carbCalories,
      fat: fatCalories,
      total: targetCalories,
    },
    grams: {
      protein: proteinGrams,
      carbs: carbGrams,
      fat: fatGrams,
      fiber: fiberGrams,
    },
    percentages: {
      protein: Math.round(proteinPercent),
      carbs: Math.round(carbPercent),
      fat: Math.round(fatPercent),
    },
    recommendations: [],
  };
}

/**
 * Generate meal-by-meal macro distribution
 */
export function distributeMacrosToMeals(
  dailyMacros: MacroGrams,
  mealCount: number = 3,
  includeSnacks: boolean = true
): { meal: string; protein: number; carbs: number; fat: number; fiber: number }[] {
  const meals: { meal: string; protein: number; carbs: number; fat: number; fiber: number }[] = [];
  
  if (mealCount === 3 && includeSnacks) {
    // 3 meals + 2 snacks distribution
    meals.push({
      meal: 'Breakfast',
      protein: Math.round(dailyMacros.protein * 0.25),
      carbs: Math.round(dailyMacros.carbs * 0.25),
      fat: Math.round(dailyMacros.fat * 0.25),
      fiber: Math.round(dailyMacros.fiber * 0.2),
    });
    meals.push({
      meal: 'Morning Snack',
      protein: Math.round(dailyMacros.protein * 0.10),
      carbs: Math.round(dailyMacros.carbs * 0.10),
      fat: Math.round(dailyMacros.fat * 0.10),
      fiber: Math.round(dailyMacros.fiber * 0.15),
    });
    meals.push({
      meal: 'Lunch',
      protein: Math.round(dailyMacros.protein * 0.30),
      carbs: Math.round(dailyMacros.carbs * 0.30),
      fat: Math.round(dailyMacros.fat * 0.30),
      fiber: Math.round(dailyMacros.fiber * 0.30),
    });
    meals.push({
      meal: 'Afternoon Snack',
      protein: Math.round(dailyMacros.protein * 0.10),
      carbs: Math.round(dailyMacros.carbs * 0.10),
      fat: Math.round(dailyMacros.fat * 0.10),
      fiber: Math.round(dailyMacros.fiber * 0.15),
    });
    meals.push({
      meal: 'Dinner',
      protein: Math.round(dailyMacros.protein * 0.25),
      carbs: Math.round(dailyMacros.carbs * 0.25),
      fat: Math.round(dailyMacros.fat * 0.25),
      fiber: Math.round(dailyMacros.fiber * 0.20),
    });
  } else {
    // Equal distribution across meals
    const perMeal = {
      protein: Math.round(dailyMacros.protein / mealCount),
      carbs: Math.round(dailyMacros.carbs / mealCount),
      fat: Math.round(dailyMacros.fat / mealCount),
      fiber: Math.round(dailyMacros.fiber / mealCount),
    };
    
    const mealNames = ['Breakfast', 'Lunch', 'Dinner', 'Snack 1', 'Snack 2', 'Snack 3'];
    for (let i = 0; i < mealCount; i++) {
      meals.push({
        meal: mealNames[i] || `Meal ${i + 1}`,
        ...perMeal,
      });
    }
  }
  
  return meals;
}

/**
 * Generate recommendations based on macro goals
 */
function generateMacroRecommendations(goal: MacroGoal, macros: MacroGrams): string[] {
  const recommendations: string[] = [];
  
  // Protein recommendations
  recommendations.push(`Aim for ${macros.protein}g protein daily - spread across all meals`);
  
  // Goal-specific recommendations
  switch (goal) {
    case 'weight_loss':
      recommendations.push('Prioritize protein at each meal to maintain muscle mass');
      recommendations.push('Choose complex carbs (vegetables, whole grains) over refined carbs');
      recommendations.push('Include healthy fats from nuts, avocado, and olive oil');
      break;
    case 'keto':
      recommendations.push('Keep net carbs under 20-50g daily to maintain ketosis');
      recommendations.push('Focus on healthy fats: avocado, olive oil, nuts, fatty fish');
      recommendations.push('Monitor ketone levels during adaptation phase');
      recommendations.push('Stay hydrated and maintain electrolyte balance');
      break;
    case 'low_carb':
      recommendations.push('Focus carbs around workout times for better utilization');
      recommendations.push('Choose non-starchy vegetables for fiber without excess carbs');
      break;
    case 'muscle_gain':
      recommendations.push('Distribute protein evenly across 4-5 meals for optimal synthesis');
      recommendations.push('Time carbs around workouts for energy and recovery');
      recommendations.push('Consider protein supplement if struggling to meet targets');
      break;
    default:
      recommendations.push('Eat a variety of whole foods from all food groups');
      recommendations.push('Limit processed foods and added sugars');
  }
  
  // Fiber recommendation
  recommendations.push(`Target ${macros.fiber}g fiber daily from vegetables, fruits, and whole grains`);
  
  return recommendations;
}

/**
 * GLP-1 specific macro recommendations
 */
export function getGLP1MacroRecommendations(targetCalories: number): MacroResult & { glp1Tips: string[] } {
  // GLP-1 patients benefit from higher protein, moderate carbs, healthy fats
  const macros = calculateMacros(targetCalories, 'weight_loss');
  
  const glp1Tips = [
    'Eat protein first at each meal to maximize satiety',
    'Take small bites and eat slowly - GLP-1 slows digestion',
    'Stop eating when you feel satisfied, not full',
    'Avoid high-fat foods that may worsen GI side effects',
    'Stay well hydrated - aim for 64+ oz water daily',
    'Avoid carbonated beverages which may cause discomfort',
    'If experiencing nausea, try smaller, more frequent meals',
    'Focus on nutrient-dense foods since you may eat less overall',
  ];
  
  return {
    ...macros,
    glp1Tips,
  };
}

/**
 * Protein source recommendations
 */
export const PROTEIN_SOURCES = {
  lean: [
    { name: 'Chicken breast (skinless)', gramsPerOz: 9 },
    { name: 'Turkey breast', gramsPerOz: 8 },
    { name: 'White fish (cod, tilapia)', gramsPerOz: 7 },
    { name: 'Shrimp', gramsPerOz: 6 },
    { name: 'Egg whites', gramsPerOz: 3.6 },
    { name: 'Fat-free Greek yogurt', gramsPerOz: 3 },
  ],
  moderate: [
    { name: 'Salmon', gramsPerOz: 7 },
    { name: 'Lean beef (93% lean)', gramsPerOz: 7 },
    { name: 'Pork tenderloin', gramsPerOz: 7 },
    { name: 'Whole eggs', gramsPerOz: 3.5 },
    { name: 'Cottage cheese (2%)', gramsPerOz: 3.5 },
    { name: 'Tofu (firm)', gramsPerOz: 2.8 },
  ],
  plant: [
    { name: 'Tempeh', gramsPerOz: 5.5 },
    { name: 'Edamame', gramsPerOz: 3 },
    { name: 'Lentils (cooked)', gramsPerOz: 2.5 },
    { name: 'Black beans (cooked)', gramsPerOz: 2.1 },
    { name: 'Chickpeas (cooked)', gramsPerOz: 2 },
    { name: 'Quinoa (cooked)', gramsPerOz: 1.2 },
  ],
};

/**
 * Validate macro input
 */
export function validateMacroInput(
  calories: number,
  percentages: MacroRatio
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (calories < 800 || calories > 10000) {
    errors.push('Calories must be between 800 and 10,000');
  }
  
  const total = percentages.protein + percentages.carbs + percentages.fat;
  if (Math.abs(total - 100) > 5) {
    errors.push('Macro percentages must sum to approximately 100%');
  }
  
  if (percentages.protein < 10 || percentages.protein > 50) {
    errors.push('Protein should be between 10-50% of calories');
  }
  
  if (percentages.fat < 15 || percentages.fat > 75) {
    errors.push('Fat should be between 15-75% of calories');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
