"use client";

export const dynamic = 'force-dynamic';

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Download, Calendar, TrendingDown, Apple, Coffee, Sun, Moon, ChevronRight } from "lucide-react";

export default function DietaryPlansPage() {
  const [selectedWeek, setSelectedWeek] = useState(1);

  const mealPlans = [
    {
      week: "1-4",
      title: "Getting Started",
      calories: "1200-1500",
      focus: "Portion Control",
      description: "Introduction to healthy eating habits"
    },
    {
      week: "5-8",
      title: "Building Habits",
      calories: "1400-1700",
      focus: "Protein Focus",
      description: "Increasing protein intake for satiety"
    },
    {
      week: "9-12",
      title: "Maintenance",
      calories: "1600-1900",
      focus: "Balance",
      description: "Sustainable long-term eating patterns"
    }
  ];

  const todaysMeals = {
    breakfast: {
      name: "Protein Smoothie Bowl",
      calories: 320,
      protein: "25g",
      time: "7:00 AM",
      ingredients: ["Greek yogurt", "Berries", "Protein powder", "Granola"]
    },
    lunch: {
      name: "Grilled Chicken Salad",
      calories: 420,
      protein: "35g",
      time: "12:30 PM",
      ingredients: ["Chicken breast", "Mixed greens", "Avocado", "Vinaigrette"]
    },
    snack: {
      name: "Apple with Almond Butter",
      calories: 180,
      protein: "7g",
      time: "3:30 PM",
      ingredients: ["Apple", "Almond butter"]
    },
    dinner: {
      name: "Baked Salmon & Veggies",
      calories: 480,
      protein: "40g",
      time: "6:30 PM",
      ingredients: ["Salmon", "Broccoli", "Sweet potato", "Olive oil"]
    }
  };

  const tips = [
    "Drink at least 8 glasses of water daily",
    "Eat protein with every meal",
    "Avoid eating 3 hours before bed",
    "Prep meals on Sunday for the week",
    "Keep healthy snacks visible"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/patient-portal" className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-semibold">Dietary Plans</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Current Week Plan */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">Week {selectedWeek} Plan</h2>
              <p className="text-green-100 text-sm mt-1">1400 calories/day target</p>
            </div>
            <TrendingDown className="w-8 h-8 text-green-200" />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white/20 backdrop-blur rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">107g</p>
              <p className="text-xs text-green-100">Protein</p>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">140g</p>
              <p className="text-xs text-green-100">Carbs</p>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">47g</p>
              <p className="text-xs text-green-100">Fats</p>
            </div>
          </div>

          <button className="w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
            <Download className="w-4 h-4" />
            Download PDF Plan
          </button>
        </div>

        {/* Today's Meals */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Today's Meals</h2>
            <span className="text-sm text-gray-500">{new Date().toLocaleDateString()}</span>
          </div>

          <div className="space-y-3">
            {/* Breakfast */}
            <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200">
              <div className="flex items-center gap-3 mb-2">
                <Sun className="w-5 h-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">{todaysMeals.breakfast.name}</p>
                  <p className="text-xs text-gray-600">{todaysMeals.breakfast.time}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{todaysMeals.breakfast.calories} cal</p>
                  <p className="text-xs text-gray-600">{todaysMeals.breakfast.protein} protein</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {todaysMeals.breakfast.ingredients.map((ing, idx) => (
                  <span key={idx} className="text-xs bg-white px-2 py-1 rounded">
                    {ing}
                  </span>
                ))}
              </div>
            </div>

            {/* Lunch */}
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center gap-3 mb-2">
                <Sun className="w-5 h-5 text-blue-600" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">{todaysMeals.lunch.name}</p>
                  <p className="text-xs text-gray-600">{todaysMeals.lunch.time}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{todaysMeals.lunch.calories} cal</p>
                  <p className="text-xs text-gray-600">{todaysMeals.lunch.protein} protein</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {todaysMeals.lunch.ingredients.map((ing, idx) => (
                  <span key={idx} className="text-xs bg-white px-2 py-1 rounded">
                    {ing}
                  </span>
                ))}
              </div>
            </div>

            {/* Snack */}
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="flex items-center gap-3 mb-2">
                <Apple className="w-5 h-5 text-green-600" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">{todaysMeals.snack.name}</p>
                  <p className="text-xs text-gray-600">{todaysMeals.snack.time}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{todaysMeals.snack.calories} cal</p>
                  <p className="text-xs text-gray-600">{todaysMeals.snack.protein} protein</p>
                </div>
              </div>
            </div>

            {/* Dinner */}
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
              <div className="flex items-center gap-3 mb-2">
                <Moon className="w-5 h-5 text-purple-600" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">{todaysMeals.dinner.name}</p>
                  <p className="text-xs text-gray-600">{todaysMeals.dinner.time}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{todaysMeals.dinner.calories} cal</p>
                  <p className="text-xs text-gray-600">{todaysMeals.dinner.protein} protein</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {todaysMeals.dinner.ingredients.map((ing, idx) => (
                  <span key={idx} className="text-xs bg-white px-2 py-1 rounded">
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="mt-4 pt-4 border-t flex justify-between items-center">
            <span className="font-semibold">Daily Total</span>
            <div className="text-right">
              <p className="font-bold">1,400 calories</p>
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
              className="w-full bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded">
                      Week {plan.week}
                    </span>
                    <h4 className="font-semibold">{plan.title}</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{plan.description}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{plan.calories} cal/day</span>
                    <span>•</span>
                    <span>{plan.focus}</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </button>
          ))}
        </div>

        {/* Tips */}
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-blue-200">
          <h3 className="font-semibold mb-3">Daily Tips</h3>
          <div className="space-y-2">
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5" />
                <p className="text-sm text-gray-700">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
