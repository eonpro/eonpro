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
    color: 'bg-purple-500',
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
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Medical Calculators</h1>
        <p className="text-gray-500 mt-1">Clinical decision support tools and calculators</p>
      </div>

      {/* Calculator Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {calculators.map((calc) => {
          const Icon = calc.icon;
          if (calc.implemented) {
            return (
              <Link
                key={calc.name}
                href={calc.href}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all"
              >
                <div className={`w-12 h-12 rounded-xl ${calc.color} flex items-center justify-center mb-4`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{calc.name}</h3>
                <p className="text-sm text-gray-500">{calc.description}</p>
              </Link>
            );
          }
          return (
            <div
              key={calc.name}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 opacity-60"
            >
              <div className={`w-12 h-12 rounded-xl ${calc.color} flex items-center justify-center mb-4`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{calc.name}</h3>
              <p className="text-sm text-gray-500">{calc.description}</p>
              <span className="inline-block mt-2 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded">
                Coming Soon
              </span>
            </div>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="mt-8 bg-blue-50 rounded-2xl border border-blue-100 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
            <Calculator className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-medium text-blue-900 mb-1">Clinical Decision Support</h3>
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
