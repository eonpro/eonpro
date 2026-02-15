'use client';

import Link from 'next/link';
import { Calculator, Heart, Scale, Flame, Syringe, Pill } from 'lucide-react';

const calculators = [
  {
    name: 'BMI Calculator',
    description: 'Calculate Body Mass Index with ICD-10 code suggestions',
    icon: Scale,
    color: 'bg-blue-500',
    href: '/provider/calculators/bmi',
    implemented: true,
  },
  {
    name: 'GLP-1 Dosage Calculator',
    description: 'Semaglutide & Tirzepatide dosing with titration schedules',
    icon: Syringe,
    color: 'bg-[var(--brand-primary-light)]0',
    href: '/provider/calculators/glp1-dose',
    implemented: true,
  },
  {
    name: 'Cardiovascular Risk',
    description: 'ASCVD 10-year risk calculator (Pooled Cohort Equations)',
    icon: Heart,
    color: 'bg-red-500',
    href: '/provider/calculators/ascvd',
    implemented: true,
  },
  {
    name: 'Calorie Calculator',
    description: 'Daily calorie needs with GLP-1 considerations',
    icon: Flame,
    color: 'bg-orange-500',
    href: '/provider/calculators/calories',
    implemented: true,
  },
];

export default function MedicalCalculatorsPage() {
  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Medical Calculators</h1>
        <p className="mt-1 text-gray-500">Clinical decision support tools and calculators</p>
      </div>

      {/* Calculator Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {calculators.map((calc) => {
          const Icon = calc.icon;
          if (calc.implemented) {
            return (
              <Link
                key={calc.name}
                href={calc.href}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md"
              >
                <div
                  className={`h-12 w-12 rounded-xl ${calc.color} mb-4 flex items-center justify-center`}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="mb-1 font-semibold text-gray-900">{calc.name}</h3>
                <p className="text-sm text-gray-500">{calc.description}</p>
              </Link>
            );
          }
          return (
            <div
              key={calc.name}
              className="rounded-2xl border border-gray-100 bg-white p-5 opacity-60 shadow-sm"
            >
              <div
                className={`h-12 w-12 rounded-xl ${calc.color} mb-4 flex items-center justify-center`}
              >
                <Icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-1 font-semibold text-gray-900">{calc.name}</h3>
              <p className="text-sm text-gray-500">{calc.description}</p>
              <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-400">
                Coming Soon
              </span>
            </div>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500">
            <Calculator className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="mb-1 font-medium text-blue-900">Clinical Decision Support</h3>
            <p className="text-sm text-blue-700">
              These calculators are provided as clinical decision support tools. Always use clinical
              judgment and consider patient-specific factors when making treatment decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
