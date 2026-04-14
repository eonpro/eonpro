'use client';

import { Stethoscope } from 'lucide-react';
import PlatformPageLayout from '../_components/PlatformPageLayout';

function ProviderMockup() {
  return (
    <div className="w-full max-w-[380px] overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#1e293b] px-5 py-3">
        <span className="text-sm font-semibold text-white">SOAP Note — AI Scribe</span>
        <div className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400">
          AI ASSISTED
        </div>
      </div>
      <div className="p-4">
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-500">
            Subjective
          </p>
          <p className="text-xs leading-relaxed text-gray-700">
            Patient reports consistent weight loss of 4.2 lbs over the past 2 weeks. Tolerating
            semaglutide 0.5mg well. No nausea or GI side effects.
          </p>
        </div>
        <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
            Assessment
          </p>
          <p className="text-xs leading-relaxed text-gray-700">
            BMI 31.2 (down from 33.8). Responding well to current regimen. Ready for dose
            escalation.
          </p>
        </div>
        <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-violet-500">
            Plan
          </p>
          <p className="text-xs leading-relaxed text-gray-700">
            Increase semaglutide to 1.0mg weekly. Continue current diet plan. Follow up in 4 weeks.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ProviderDashboardContent() {
  return (
    <PlatformPageLayout
      badge="PROVIDER DASHBOARD"
      title="The clinical workspace providers deserve"
      highlightedWord="providers deserve"
      subtitle="A patient-centric workspace combining EMR, AI-assisted SOAP notes, e-prescribing, telehealth tools, and clinical calculators — so providers can focus on delivering care."
      gradient="from-[#3b82f6] to-[#2563eb]"
      icon={Stethoscope}
      mockup={<ProviderMockup />}
      capabilities={[
        'AI Scribe for SOAP notes',
        'DoseSpot e-prescribing',
        'Zoom telehealth integration',
        'Drug reference & ICD lookup',
        'Clinical calculators',
        'Patient messaging',
        'Lab result review',
        'Encounter history',
        'Multi-clinic support',
      ]}
      features={[
        {
          title: 'AI-Powered SOAP Notes',
          description:
            'Record or type notes, and the AI Scribe generates structured Subjective, Objective, Assessment, and Plan sections in seconds.',
        },
        {
          title: 'E-Prescribing',
          description:
            'DoseSpot-integrated prescribing with drug-drug interaction checks, formulary lookup, and EPCS for controlled substances.',
        },
        {
          title: 'Telehealth Integration',
          description:
            'Launch Zoom video visits directly from the patient chart. Pre-visit intake data is surfaced automatically.',
        },
        {
          title: 'Drug Reference & ICD Codes',
          description:
            'Search FDA drug database and ICD-10 codes inline. Auto-populate diagnoses and medication details.',
        },
        {
          title: 'Clinical Calculators',
          description:
            'BMI, GFR, metabolic rate, and dosing calculators built right into the workflow — no external tools needed.',
        },
        {
          title: 'Patient Timeline',
          description:
            'Complete chronological view of encounters, prescriptions, lab results, messages, and vitals for each patient.',
        },
      ]}
    />
  );
}
