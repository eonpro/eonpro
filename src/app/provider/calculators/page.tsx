'use client';

import { Calculator, Heart, Droplets, Scale, Brain, Activity } from 'lucide-react';

const calculators = [
  {
    name: 'BMI Calculator',
    description: 'Calculate Body Mass Index from height and weight',
    icon: Scale,
    color: 'bg-blue-500',
  },
  {
    name: 'eGFR Calculator',
    description: 'Estimated Glomerular Filtration Rate (CKD-EPI)',
    icon: Droplets,
    color: 'bg-purple-500',
  },
  {
    name: 'Cardiovascular Risk',
    description: 'ASCVD 10-year risk calculator',
    icon: Heart,
    color: 'bg-red-500',
  },
  {
    name: 'Opioid Conversion',
    description: 'MME calculator for opioid dosing',
    icon: Calculator,
    color: 'bg-amber-500',
  },
  {
    name: 'Creatinine Clearance',
    description: 'Cockcroft-Gault equation',
    icon: Activity,
    color: 'bg-[#4fa77e]',
  },
  {
    name: 'MELD Score',
    description: 'Model for End-Stage Liver Disease',
    icon: Brain,
    color: 'bg-indigo-500',
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
          return (
            <div
              key={calc.name}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className={`w-12 h-12 rounded-xl ${calc.color} flex items-center justify-center mb-4`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{calc.name}</h3>
              <p className="text-sm text-gray-500">{calc.description}</p>
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
