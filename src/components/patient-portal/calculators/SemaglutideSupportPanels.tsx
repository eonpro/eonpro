'use client';

import Link from 'next/link';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { AlertTriangle, Syringe, Check, ChevronRight } from 'lucide-react';

const dosingSchedule = [
  { week: '1-4', dose: 0.25, label: 'Weeks 1-4', desc: 'Starting dose' },
  { week: '5-8', dose: 0.5, label: 'Weeks 5-8', desc: 'First increase' },
  { week: '9-12', dose: 1.0, label: 'Weeks 9-12', desc: 'Building up' },
  { week: '13-16', dose: 1.7, label: 'Weeks 13-16', desc: 'Approaching target' },
  { week: '17+', dose: 2.4, label: 'Week 17+', desc: 'Maintenance dose' },
];

export default function SemaglutideSupportPanels({
  units,
  concentration,
  result,
  primaryColor,
}: {
  units: string;
  concentration: number;
  result: { mg: string; mL: string } | null;
  primaryColor: string;
}) {
  return (
    <>
      <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
        <div className="border-b border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900">How It Works</h3>
        </div>

        <div className="space-y-4 p-6">
          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Step 1: Units to mL
            </div>
            <div className="font-mono text-lg font-semibold text-gray-900">
              {units || '0'} units / 100 = {result?.mL || '0'} mL
            </div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Step 2: mL to mg
            </div>
            <div className="font-mono text-lg font-semibold text-gray-900">
              {result?.mL || '0'} mL x {concentration} mg/mL = {result?.mg || '0'} mg
            </div>
          </div>

          <div className="rounded-2xl p-4" style={{ backgroundColor: `${primaryColor}10` }}>
            <div
              className="mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: primaryColor }}
            >
              Quick Reference
            </div>
            <div className="font-mono text-lg font-semibold" style={{ color: primaryColor }}>
              100 units = 1 mL = {concentration} mg
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
        <div className="border-b border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900">Standard Titration</h3>
          <p className="mt-1 text-sm text-gray-500">Typical dosing schedule</p>
        </div>

        <div className="p-6">
          <div className="relative">
            <div className="absolute bottom-0 left-5 top-0 w-0.5 bg-gray-100" />

            <div className="space-y-4">
              {dosingSchedule.map((s, i) => (
                <div key={s.week} className="relative flex items-center gap-4 pl-12">
                  <div
                    className={`absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border-4 border-white text-sm font-semibold shadow ${
                      i === dosingSchedule.length - 1
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex flex-1 items-center justify-between rounded-2xl bg-gray-50 p-4">
                    <div>
                      <p className="font-semibold text-gray-900">{s.label}</p>
                      <p className="text-sm text-gray-500">{s.desc}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-semibold text-gray-900">{s.dose} mg</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-amber-900">Important Safety Information</h3>
            <p className="text-sm leading-relaxed text-amber-800">
              This calculator is for reference only. Always follow your provider&apos;s specific
              dosing instructions. Contact your healthcare provider if you have any questions about
              your dose or experience side effects.
            </p>
          </div>
        </div>
      </div>

      <Link
        href={`${PATIENT_PORTAL_PATH}/tools/injection-tracker`}
        className="block overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50 transition-shadow hover:shadow-2xl"
      >
        <div className="flex items-center gap-4 p-6">
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

      <div
        className="overflow-hidden rounded-3xl p-6"
        style={{ backgroundColor: `${primaryColor}08`, borderColor: `${primaryColor}30` }}
      >
        <h3 className="mb-3 font-semibold text-gray-900">Storage Instructions</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
            Store in refrigerator at 36F to 46F (2C to 8C)
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
            After first use, can be stored at room temp up to 77F for 28 days
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
            Do not freeze and keep away from direct light
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: primaryColor }} />
            Let medication reach room temperature (~30 min) before injecting
          </li>
        </ul>
      </div>
    </>
  );
}
