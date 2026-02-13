'use client';

import Link from 'next/link';
import { useClinicBranding, usePortalFeatures } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import {
  Activity,
  Flame,
  Syringe,
  Calculator,
  ChevronRight,
  Scale,
  Heart,
  Target,
  MapPin,
  Utensils,
} from 'lucide-react';

const getCalculators = () => [
  {
    id: 'bmi',
    title: 'BMI Calculator',
    description: 'Calculate your Body Mass Index',
    icon: Activity,
    color: '#8B5CF6',
    bgColor: '#8B5CF615',
    feature: 'showBMICalculator' as const,
    href: `${PATIENT_PORTAL_PATH}/calculators/bmi`,
  },
  {
    id: 'calories',
    title: 'Calorie Calculator',
    description: 'Find your daily calorie needs',
    icon: Flame,
    color: '#F59E0B',
    bgColor: '#F59E0B15',
    feature: 'showCalorieCalculator' as const,
    href: `${PATIENT_PORTAL_PATH}/calculators/calories`,
  },
  {
    id: 'macros',
    title: 'Macro Calculator',
    description: 'Calculate protein, carbs & fat targets',
    icon: Target,
    color: '#EF4444',
    bgColor: '#EF444415',
    feature: 'showCalorieCalculator' as const,
    href: `${PATIENT_PORTAL_PATH}/calculators/macros`,
  },
  {
    id: 'semaglutide',
    title: 'Semaglutide Dose',
    description: 'Convert units to mg for your injection',
    icon: Syringe,
    color: '#10B981',
    bgColor: '#10B98115',
    feature: 'showDoseCalculator' as const,
    href: `${PATIENT_PORTAL_PATH}/calculators/semaglutide`,
  },
  {
    id: 'tirzepatide',
    title: 'Tirzepatide Dose',
    description: 'Calculate your Tirzepatide dose',
    icon: Syringe,
    color: '#3B82F6',
    bgColor: '#3B82F615',
    feature: 'showDoseCalculator' as const,
    href: `${PATIENT_PORTAL_PATH}/calculators/tirzepatide`,
  },
  {
    id: 'injection-tracker',
    title: 'Injection Site Tracker',
    description: 'Track and rotate your injection sites',
    icon: MapPin,
    color: '#14B8A6',
    bgColor: '#14B8A615',
    feature: 'showDoseCalculator' as const,
    href: `${PATIENT_PORTAL_PATH}/tools/injection-tracker`,
  },
];

export default function CalculatorsPage() {
  const { branding } = useClinicBranding();
  const features = usePortalFeatures();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const calculators = getCalculators();
  const availableCalculators = calculators.filter((calc) => {
    if (calc.feature === 'showBMICalculator') return features.showBMICalculator;
    if (calc.feature === 'showCalorieCalculator') return features.showCalorieCalculator;
    if (calc.feature === 'showDoseCalculator') return features.showDoseCalculator;
    return true;
  });

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Health Tools</h1>
        <p className="mt-1 text-gray-500">Calculators to help you on your journey</p>
      </div>

      {/* Calculator Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {availableCalculators.map((calc) => {
          const Icon = calc.icon;
          return (
            <Link
              key={calc.id}
              href={calc.href}
              className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl p-3" style={{ backgroundColor: calc.bgColor }}>
                  <Icon className="h-6 w-6" style={{ color: calc.color }} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 group-hover:text-opacity-80">
                    {calc.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">{calc.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300 transition-all group-hover:translate-x-1 group-hover:text-gray-400" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Info Card */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <Calculator className="h-6 w-6 text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">About These Tools</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              These calculators are designed to help you understand your health metrics and
              medication doses. Always consult with your healthcare provider before making any
              changes to your treatment plan.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          href={`${PATIENT_PORTAL_PATH}/progress`}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
        >
          <Scale className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Track Weight Progress</span>
          <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />
        </Link>
        <Link
          href={`${PATIENT_PORTAL_PATH}/dietary/meal-planner`}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
        >
          <Utensils className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Meal Planner</span>
          <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />
        </Link>
        <Link
          href={`${PATIENT_PORTAL_PATH}/medications`}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
        >
          <Heart className="h-5 w-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">View Medications</span>
          <ChevronRight className="ml-auto h-4 w-4 text-gray-300" />
        </Link>
      </div>
    </div>
  );
}
