'use client';

import { Activity } from 'lucide-react';

interface VitalData {
  height?: string;
  weight?: string | number;
  bmi?: string | number;
  bloodPressure?: string;
}

interface PatientOverviewCardProps {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    createdAt: string | Date;
    tags?: string[] | null;
    orders?: any[];
  };
  vitals?: VitalData;
  intakeData?: any;
}

// Helper to extract vitals from intake data
function extractVitalsFromIntake(intakeData: any): VitalData {
  const vitals: VitalData = {};
  
  if (!intakeData) return vitals;
  
  // Try to extract from various intake data formats
  const data = intakeData.data || intakeData;
  
  // Height
  if (data.height) vitals.height = data.height;
  else if (data.heightFeet && data.heightInches) {
    vitals.height = `${data.heightFeet}'${data.heightInches}"`;
  }
  
  // Weight
  if (data.weight) vitals.weight = data.weight;
  else if (data.currentWeight) vitals.weight = data.currentWeight;
  
  // BMI
  if (data.bmi) vitals.bmi = data.bmi;
  
  // Blood Pressure
  if (data.bloodPressure) vitals.bloodPressure = data.bloodPressure;
  else if (data.systolic && data.diastolic) {
    vitals.bloodPressure = `${data.systolic}/${data.diastolic}`;
  }
  
  return vitals;
}

// Tag color mapping
const getTagStyle = (tag: string) => {
  const tagLower = tag.toLowerCase().replace('#', '');
  
  if (tagLower.includes('weightloss') || tagLower.includes('weight')) {
    return 'bg-[#efece7] text-gray-700 border-gray-300';
  }
  if (tagLower.includes('english') || tagLower.includes('language')) {
    return 'bg-[#4fa77e] text-white border-[#4fa77e]';
  }
  if (tagLower.includes('glp') || tagLower.includes('medication')) {
    return 'bg-rose-100 text-rose-700 border-rose-200';
  }
  if (tagLower.includes('complete')) {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  if (tagLower.includes('eonmeds')) {
    return 'bg-blue-100 text-blue-700 border-blue-200';
  }
  
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

export default function PatientOverviewCard({ patient, vitals, intakeData }: PatientOverviewCardProps) {
  const extractedVitals = vitals || extractVitalsFromIntake(intakeData);
  const totalPrescriptions = patient.orders?.length || 0;
  
  // Parse tags
  const patientTags = Array.isArray(patient.tags) 
    ? patient.tags.map((tag: string) => tag.replace(/^#/, ''))
    : [];

  return (
    <div className="space-y-6">
      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-900">Patient Overview</h1>

      {/* Vitals Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Vitals</h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Height */}
          <div className="bg-[#efece7] rounded-xl p-4">
            <p className="text-sm text-gray-500 mb-1">Height</p>
            <p className="text-2xl font-bold text-gray-900">
              {extractedVitals.height || '—'}
            </p>
            <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
              <div className="h-full bg-gray-500 rounded-full" style={{ width: '60%' }} />
            </div>
          </div>

          {/* Weight */}
          <div className="bg-[#efece7] rounded-xl p-4">
            <p className="text-sm text-gray-500 mb-1">Weight</p>
            <p className="text-2xl font-bold text-gray-900">
              {extractedVitals.weight ? `${extractedVitals.weight}lbs` : '—'}
            </p>
            <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
              <div className="h-full bg-gray-500 rounded-full" style={{ width: '70%' }} />
            </div>
          </div>

          {/* BMI */}
          <div className="bg-[#efece7] rounded-xl p-4">
            <p className="text-sm text-gray-500 mb-1">BMI</p>
            <p className="text-2xl font-bold text-gray-900">
              {extractedVitals.bmi || '—'}
            </p>
            <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
              <div className="h-full bg-gray-500 rounded-full" style={{ width: '55%' }} />
            </div>
          </div>

          {/* Blood Pressure */}
          <div className="bg-[#efece7] rounded-xl p-4">
            <p className="text-sm text-gray-500 mb-1">Blood pressure</p>
            <p className="text-2xl font-bold text-gray-900">
              {extractedVitals.bloodPressure || '—'}
            </p>
            <div className="mt-3 h-2 bg-gray-300 rounded-full overflow-hidden">
              <div className="h-full bg-gray-500 rounded-full" style={{ width: '45%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Tags and Overview */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {/* Tags */}
        {patientTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {patientTags.map((tag: string) => (
              <span
                key={tag}
                className={`px-4 py-2 rounded-full text-sm font-medium border ${getTagStyle(tag)}`}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Overview Stats */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Overview</h3>
          <p className="text-sm text-gray-600">Total prescriptions: {totalPrescriptions}</p>
          <p className="text-sm text-gray-500 mt-1">
            Last updated: {new Date(patient.createdAt).toLocaleString()}
          </p>
        </div>

        {/* Weight Chart Placeholder */}
        <div className="mt-6 bg-[#efece7] rounded-xl p-4 h-48 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Weight tracking chart</p>
            <p className="text-xs">Data will appear as weight is logged</p>
          </div>
        </div>
      </div>
    </div>
  );
}
