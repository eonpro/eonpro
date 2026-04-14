'use client';

import Link from 'next/link';
import { Syringe, ChevronRight } from 'lucide-react';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

interface DosingScheduleItem {
  week: string;
  dose: number;
  label: string;
  desc: string;
}

export default function TirzepatideSupportPanels({
  concentration,
  dosingSchedule,
  primaryColor,
}: {
  concentration: number;
  dosingSchedule: DosingScheduleItem[];
  primaryColor: string;
}) {
  return (
    <>
      <div className="overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">How It Works</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200 text-sm font-bold text-gray-600">
              1
            </span>
            <span className="text-gray-700">Enter units drawn on your insulin syringe</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200 text-sm font-bold text-gray-600">
              2
            </span>
            <span className="text-gray-700">100 units = 1 mL</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200 text-sm font-bold text-gray-600">
              3
            </span>
            <span className="text-gray-700">mL × {concentration} mg/mL = your dose in mg</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50">
        <h3 className="mb-3 text-lg font-semibold text-gray-900">Standard Titration Schedule</h3>
        <div className="space-y-2">
          {dosingSchedule.map((s) => (
            <div
              key={s.week}
              className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm last:border-0"
            >
              <span className="text-gray-600">{s.label}</span>
              <span className="font-semibold text-gray-900">{s.dose} mg</span>
            </div>
          ))}
        </div>
      </div>

      <Link
        href={`${PATIENT_PORTAL_PATH}/tools/injection-tracker`}
        className="block overflow-hidden rounded-3xl bg-white p-5 shadow-xl shadow-gray-200/50 transition-shadow hover:shadow-2xl"
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${primaryColor}15` }}
          >
            <Syringe className="h-6 w-6" style={{ color: primaryColor }} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Injection Site Tracker</h3>
            <p className="text-sm text-gray-500">Track and rotate your injection sites</p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </Link>
    </>
  );
}
