'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Download,
  Calendar,
  TrendingDown,
  Apple,
  Coffee,
  Sun,
  Moon,
  ChevronRight,
} from 'lucide-react';

export default function DietaryPlansPage() {
  const [selectedWeek, setSelectedWeek] = useState(1);

  const mealPlans = [
    {
      week: '1-4',
      title: 'Getting Started',
      calories: '1200-1500',
      focus: 'Portion Control',
      description: 'Introduction to healthy eating habits',
    },
    {
      week: '5-8',
      title: 'Building Habits',
      calories: '1400-1700',
      focus: 'Protein Focus',
      description: 'Increasing protein intake for satiety',
    },
    {
      week: '9-12',
      title: 'Maintenance',
      calories: '1600-1900',
      focus: 'Balance',
      description: 'Sustainable long-term eating patterns',
    },
  ];

  const todaysMeals = {
    breakfast: {
      name: 'Protein Smoothie Bowl',
      calories: 320,
      protein: '25g',
      time: '7:00 AM',
      ingredients: ['Greek yogurt', 'Berries', 'Protein powder', 'Granola'],
    },
    lunch: {
      name: 'Grilled Chicken Salad',
      calories: 420,
      protein: '35g',
      time: '12:30 PM',
      ingredients: ['Chicken breast', 'Mixed greens', 'Avocado', 'Vinaigrette'],
    },
    snack: {
      name: 'Apple with Almond Butter',
      calories: 180,
      protein: '7g',
      time: '3:30 PM',
      ingredients: ['Apple', 'Almond butter'],
    },
    dinner: {
      name: 'Baked Salmon & Veggies',
      calories: 480,
      protein: '40g',
      time: '6:30 PM',
      ingredients: ['Salmon', 'Broccoli', 'Sweet potato', 'Olive oil'],
    },
  };

  const tips = [
    'Drink at least 8 glasses of water daily',
    'Eat protein with every meal',
    'Avoid eating 3 hours before bed',
    'Prep meals on Sunday for the week',
    'Keep healthy snacks visible',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/patient-portal" className="rounded-lg p-2 hover:bg-gray-100">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold">Dietary Plans</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {/* Current Week Plan */}
        <div className="rounded-2xl bg-gradient-to-br from-green-500 to-green-600 p-6 text-white">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Week {selectedWeek} Plan</h2>
              <p className="mt-1 text-sm text-green-100">1400 calories/day target</p>
            </div>
            <TrendingDown className="h-8 w-8 text-green-200" />
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white/20 p-3 text-center backdrop-blur">
              <p className="text-2xl font-semibold">107g</p>
              <p className="text-xs text-green-100">Protein</p>
            </div>
            <div className="rounded-lg bg-white/20 p-3 text-center backdrop-blur">
              <p className="text-2xl font-semibold">140g</p>
              <p className="text-xs text-green-100">Carbs</p>
            </div>
            <div className="rounded-lg bg-white/20 p-3 text-center backdrop-blur">
              <p className="text-2xl font-semibold">47g</p>
              <p className="text-xs text-green-100">Fats</p>
            </div>
          </div>

          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/20 py-2 font-medium backdrop-blur transition-colors hover:bg-white/30">
            <Download className="h-4 w-4" />
            Download PDF Plan
          </button>
        </div>

        {/* Today's Meals */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today's Meals</h2>
            <span className="text-sm text-gray-500">{new Date().toLocaleDateString()}</span>
          </div>

          <div className="space-y-3">
            {/* Breakfast */}
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <div className="mb-2 flex items-center gap-3">
                <Sun className="h-5 w-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{todaysMeals.breakfast.name}</p>
                  <p className="text-xs text-gray-600">{todaysMeals.breakfast.time}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{todaysMeals.breakfast.calories} cal</p>
                  <p className="text-xs text-gray-600">{todaysMeals.breakfast.protein} protein</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {todaysMeals.breakfast.ingredients.map((ing, idx) => (
                  <span key={idx} className="rounded bg-white px-2 py-1 text-xs">
                    {ing}
                  </span>
                ))}
              </div>
            </div>

            {/* Lunch */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="mb-2 flex items-center gap-3">
                <Sun className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{todaysMeals.lunch.name}</p>
                  <p className="text-xs text-gray-600">{todaysMeals.lunch.time}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{todaysMeals.lunch.calories} cal</p>
                  <p className="text-xs text-gray-600">{todaysMeals.lunch.protein} protein</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {todaysMeals.lunch.ingredients.map((ing, idx) => (
                  <span key={idx} className="rounded bg-white px-2 py-1 text-xs">
                    {ing}
                  </span>
                ))}
              </div>
            </div>

            {/* Snack */}
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="mb-2 flex items-center gap-3">
                <Apple className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{todaysMeals.snack.name}</p>
                  <p className="text-xs text-gray-600">{todaysMeals.snack.time}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{todaysMeals.snack.calories} cal</p>
                  <p className="text-xs text-gray-600">{todaysMeals.snack.protein} protein</p>
                </div>
              </div>
            </div>

            {/* Dinner */}
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
              <div className="mb-2 flex items-center gap-3">
                <Moon className="h-5 w-5 text-purple-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{todaysMeals.dinner.name}</p>
                  <p className="text-xs text-gray-600">{todaysMeals.dinner.time}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{todaysMeals.dinner.calories} cal</p>
                  <p className="text-xs text-gray-600">{todaysMeals.dinner.protein} protein</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {todaysMeals.dinner.ingredients.map((ing, idx) => (
                  <span key={idx} className="rounded bg-white px-2 py-1 text-xs">
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="font-semibold">Daily Total</span>
            <div className="text-right">
              <p className="font-semibold">1,400 calories</p>
              <p className="text-xs text-gray-600">107g protein</p>
            </div>
          </div>
        </div>

        {/* Weekly Plans */}
        <div className="space-y-4">
          <h3 className="font-semibold">Your Meal Plans</h3>
          {mealPlans.map((plan, idx) => (
            <button
              key={idx}
              className="w-full rounded-xl bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                      Week {plan.week}
                    </span>
                    <h4 className="font-semibold">{plan.title}</h4>
                  </div>
                  <p className="mb-2 text-sm text-gray-600">{plan.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{plan.calories} cal/day</span>
                    <span>•</span>
                    <span>{plan.focus}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </button>
          ))}
        </div>

        {/* Tips */}
        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-purple-50 p-6">
          <h3 className="mb-3 font-semibold">Daily Tips</h3>
          <div className="space-y-2">
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                <p className="text-sm text-gray-700">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
