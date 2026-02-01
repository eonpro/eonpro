'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  ArrowLeft,
  Utensils,
  Check,
  Beef,
  Salad,
  Coffee,
  Apple,
  Droplets,
  Clock,
  AlertCircle,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface MealSuggestion {
  name: string;
  description: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  glp1Friendly: boolean;
  tips?: string;
}

interface MealCategory {
  id: string;
  name: string;
  icon: React.ElementType;
  time: string;
  suggestions: MealSuggestion[];
}

const MEAL_CATEGORIES: MealCategory[] = [
  {
    id: 'breakfast',
    name: 'Breakfast',
    icon: Coffee,
    time: '7-9 AM',
    suggestions: [
      {
        name: 'Greek Yogurt Parfait',
        description: 'Plain Greek yogurt with berries and a sprinkle of nuts',
        protein: 20,
        carbs: 25,
        fat: 8,
        calories: 250,
        glp1Friendly: true,
        tips: 'High protein, easy to digest',
      },
      {
        name: 'Veggie Egg White Omelet',
        description: '3 egg whites with spinach, tomatoes, and feta',
        protein: 18,
        carbs: 5,
        fat: 6,
        calories: 150,
        glp1Friendly: true,
        tips: 'Light and protein-rich',
      },
      {
        name: 'Protein Smoothie',
        description: 'Protein powder, banana, almond milk, and spinach',
        protein: 25,
        carbs: 30,
        fat: 5,
        calories: 280,
        glp1Friendly: true,
        tips: 'Easy to consume if appetite is low',
      },
      {
        name: 'Cottage Cheese Bowl',
        description: 'Low-fat cottage cheese with sliced peaches and cinnamon',
        protein: 24,
        carbs: 20,
        fat: 4,
        calories: 220,
        glp1Friendly: true,
      },
    ],
  },
  {
    id: 'lunch',
    name: 'Lunch',
    icon: Salad,
    time: '12-1 PM',
    suggestions: [
      {
        name: 'Grilled Chicken Salad',
        description: 'Mixed greens, grilled chicken, avocado, light vinaigrette',
        protein: 35,
        carbs: 12,
        fat: 18,
        calories: 380,
        glp1Friendly: true,
        tips: 'Start with protein, then veggies',
      },
      {
        name: 'Turkey Lettuce Wraps',
        description: 'Lean ground turkey in butter lettuce with Asian sauce',
        protein: 28,
        carbs: 8,
        fat: 12,
        calories: 280,
        glp1Friendly: true,
      },
      {
        name: 'Salmon & Quinoa Bowl',
        description: 'Baked salmon with quinoa, roasted vegetables',
        protein: 32,
        carbs: 35,
        fat: 14,
        calories: 420,
        glp1Friendly: true,
        tips: 'Omega-3s support overall health',
      },
      {
        name: 'Greek Chicken Wrap',
        description: 'Whole wheat wrap with chicken, tzatziki, cucumber',
        protein: 30,
        carbs: 28,
        fat: 10,
        calories: 340,
        glp1Friendly: true,
      },
    ],
  },
  {
    id: 'dinner',
    name: 'Dinner',
    icon: Utensils,
    time: '6-7 PM',
    suggestions: [
      {
        name: 'Baked Cod with Vegetables',
        description: 'Herb-crusted cod with roasted broccoli and sweet potato',
        protein: 30,
        carbs: 25,
        fat: 8,
        calories: 320,
        glp1Friendly: true,
        tips: 'Light protein, easy on digestion',
      },
      {
        name: 'Turkey Meatballs & Zoodles',
        description: 'Lean turkey meatballs with zucchini noodles and marinara',
        protein: 32,
        carbs: 18,
        fat: 12,
        calories: 340,
        glp1Friendly: true,
      },
      {
        name: 'Grilled Shrimp Stir-Fry',
        description: 'Shrimp with mixed vegetables in light garlic sauce',
        protein: 28,
        carbs: 15,
        fat: 10,
        calories: 280,
        glp1Friendly: true,
        tips: 'Low fat, high protein option',
      },
      {
        name: 'Lean Beef & Vegetable Skewers',
        description: 'Sirloin kebabs with peppers, onions, and mushrooms',
        protein: 35,
        carbs: 12,
        fat: 14,
        calories: 340,
        glp1Friendly: true,
      },
    ],
  },
  {
    id: 'snacks',
    name: 'Snacks',
    icon: Apple,
    time: 'As needed',
    suggestions: [
      {
        name: 'Hard-Boiled Eggs',
        description: '2 eggs with everything bagel seasoning',
        protein: 12,
        carbs: 1,
        fat: 10,
        calories: 140,
        glp1Friendly: true,
      },
      {
        name: 'Cheese & Apple Slices',
        description: 'Low-fat string cheese with half an apple',
        protein: 8,
        carbs: 15,
        fat: 5,
        calories: 140,
        glp1Friendly: true,
      },
      {
        name: 'Protein Bites',
        description: 'No-bake protein balls with oats and peanut butter',
        protein: 10,
        carbs: 12,
        fat: 6,
        calories: 150,
        glp1Friendly: true,
      },
      {
        name: 'Edamame',
        description: '1 cup steamed edamame with sea salt',
        protein: 17,
        carbs: 14,
        fat: 8,
        calories: 190,
        glp1Friendly: true,
      },
    ],
  },
];

const GLP1_TIPS = [
  'Eat protein first at every meal',
  'Take small bites and chew thoroughly',
  'Stop eating when 80% full',
  'Avoid drinking during meals',
  'Wait 30 minutes after eating to drink',
  'Choose soft, moist foods if nauseous',
  'Avoid high-fat and fried foods',
  'Stay hydrated between meals',
];

export default function MealPlannerPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const [selectedMealType, setSelectedMealType] = useState<string>('breakfast');
  const [selectedMeals, setSelectedMeals] = useState<Record<string, MealSuggestion | null>>({
    breakfast: null,
    lunch: null,
    dinner: null,
    snacks: null,
  });
  const [showTips, setShowTips] = useState(true);

  const currentCategory = MEAL_CATEGORIES.find((c) => c.id === selectedMealType);

  const totalDayMacros = useMemo(() => {
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    let calories = 0;

    Object.values(selectedMeals).forEach((meal) => {
      if (meal) {
        protein += meal.protein;
        carbs += meal.carbs;
        fat += meal.fat;
        calories += meal.calories;
      }
    });

    return { protein, carbs, fat, calories };
  }, [selectedMeals]);

  const selectMeal = (meal: MealSuggestion) => {
    setSelectedMeals((prev) => ({
      ...prev,
      [selectedMealType]: prev[selectedMealType]?.name === meal.name ? null : meal,
    }));
  };

  const clearAll = () => {
    setSelectedMeals({
      breakfast: null,
      lunch: null,
      dinner: null,
      snacks: null,
    });
  };

  return (
    <div className="min-h-[100dvh] px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/patient-portal/dietary"
          className="group mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Dietary
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Meal Planner</h1>
        <p className="mt-1 text-gray-500">
          GLP-1 friendly meal ideas to support your weight loss journey
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Meal Selection */}
        <div className="lg:col-span-2 space-y-5">
          {/* Meal Type Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {MEAL_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedMealType === cat.id;
              const hasSelection = selectedMeals[cat.id] !== null;
              
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedMealType(cat.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
                    isSelected
                      ? 'text-white shadow-lg'
                      : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
                  }`}
                  style={isSelected ? { backgroundColor: primaryColor } : {}}
                >
                  <Icon className="h-5 w-5" />
                  {cat.name}
                  {hasSelection && !isSelected && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Meal Time */}
          {currentCategory && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              Suggested time: {currentCategory.time}
            </div>
          )}

          {/* Meal Suggestions */}
          <div className="space-y-3">
            {currentCategory?.suggestions.map((meal) => {
              const isSelected = selectedMeals[selectedMealType]?.name === meal.name;
              
              return (
                <button
                  key={meal.name}
                  onClick={() => selectMeal(meal)}
                  className={`w-full text-left p-5 rounded-2xl transition-all ${
                    isSelected
                      ? 'bg-white border-2 shadow-lg'
                      : 'bg-white shadow-sm hover:shadow-md border-2 border-transparent'
                  }`}
                  style={isSelected ? { borderColor: primaryColor } : {}}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{meal.name}</h3>
                        {meal.glp1Friendly && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${primaryColor}15`,
                              color: primaryColor,
                            }}
                          >
                            GLP-1 Friendly
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{meal.description}</p>
                      
                      {meal.tips && (
                        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: primaryColor }}>
                          <Sparkles className="h-3 w-3" />
                          {meal.tips}
                        </p>
                      )}
                    </div>
                    
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-4 ${
                        isSelected ? 'border-transparent' : 'border-gray-200'
                      }`}
                      style={isSelected ? { backgroundColor: primaryColor } : {}}
                    >
                      {isSelected && <Check className="h-4 w-4 text-white" />}
                    </div>
                  </div>
                  
                  {/* Macro Bar */}
                  <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
                    <div className="flex items-center gap-1">
                      <Beef className="h-4 w-4 text-red-500" />
                      <span className="font-semibold text-gray-900">{meal.protein}g</span>
                      <span className="text-gray-400">P</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-4 h-4 text-blue-500">🍞</span>
                      <span className="font-semibold text-gray-900">{meal.carbs}g</span>
                      <span className="text-gray-400">C</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Droplets className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold text-gray-900">{meal.fat}g</span>
                      <span className="text-gray-400">F</span>
                    </div>
                    <div className="ml-auto font-semibold text-gray-600">
                      {meal.calories} cal
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-5">
          {/* Daily Summary */}
          <div
            className="rounded-2xl p-5"
            style={{ backgroundColor: accentColor }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Today's Plan</h3>
              {Object.values(selectedMeals).some((m) => m !== null) && (
                <button
                  onClick={clearAll}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Selected Meals Summary */}
            <div className="space-y-2 mb-4">
              {MEAL_CATEGORIES.map((cat) => {
                const meal = selectedMeals[cat.id];
                const Icon = cat.icon;
                
                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/50"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-700">{cat.name}</span>
                    </div>
                    {meal ? (
                      <span className="text-sm font-medium text-gray-900 truncate max-w-24">
                        {meal.name}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Not selected</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total Macros */}
            <div className="p-4 rounded-xl bg-white/70">
              <p className="text-sm font-medium text-gray-700 mb-3">Daily Totals</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{totalDayMacros.calories}</p>
                  <p className="text-xs text-gray-500">Cal</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-500">{totalDayMacros.protein}g</p>
                  <p className="text-xs text-gray-500">Protein</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-500">{totalDayMacros.carbs}g</p>
                  <p className="text-xs text-gray-500">Carbs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-500">{totalDayMacros.fat}g</p>
                  <p className="text-xs text-gray-500">Fat</p>
                </div>
              </div>
            </div>
          </div>

          {/* GLP-1 Tips */}
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-gray-100">
            <button
              onClick={() => setShowTips(!showTips)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" style={{ color: primaryColor }} />
                <span className="font-semibold text-gray-900">GLP-1 Eating Tips</span>
              </div>
              <ChevronRight
                className={`h-5 w-5 text-gray-400 transition-transform ${
                  showTips ? 'rotate-90' : ''
                }`}
              />
            </button>

            {showTips && (
              <ul className="mt-4 space-y-2">
                {GLP1_TIPS.map((tip, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <Check className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: primaryColor }} />
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Hydration Reminder */}
          <div
            className="rounded-2xl p-5 border-2"
            style={{
              borderColor: `${primaryColor}30`,
              backgroundColor: `${primaryColor}08`,
            }}
          >
            <div className="flex items-start gap-3">
              <Droplets className="h-6 w-6 flex-shrink-0" style={{ color: primaryColor }} />
              <div>
                <h4 className="font-semibold text-gray-900">Stay Hydrated</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Aim for 64+ oz of water daily. Drink between meals, not during, 
                  for better digestion on GLP-1 medications.
                </p>
              </div>
            </div>
          </div>

          {/* Link to Macro Calculator */}
          <Link
            href="/patient-portal/calculators/macros"
            className="block rounded-2xl bg-white p-5 shadow-lg shadow-gray-100 hover:shadow-xl transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div
                className="p-3 rounded-xl"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Beef className="h-6 w-6" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Macro Calculator</p>
                <p className="text-sm text-gray-500">
                  Get your personalized macro targets
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 ml-auto" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
