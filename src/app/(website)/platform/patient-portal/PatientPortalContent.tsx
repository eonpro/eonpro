'use client';

import { Smartphone } from 'lucide-react';
import PlatformPageLayout from '../_components/PlatformPageLayout';

function PatientPortalMockup() {
  return (
    <div className="w-full max-w-[340px] overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#4fa77e] px-5 py-3">
        <span className="text-sm font-semibold text-white">Patient Portal</span>
        <div className="flex gap-1.5">
          <div className="h-2 w-2 rounded-full bg-white/40" />
          <div className="h-2 w-2 rounded-full bg-white/40" />
          <div className="h-2 w-2 rounded-full bg-white/60" />
        </div>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4fa77e]/10 text-sm font-bold text-[#4fa77e]">
            JD
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Welcome back, Jane</p>
            <p className="text-xs text-gray-400">Weight Loss Program &middot; Week 12</p>
          </div>
        </div>
        <div className="mb-3 rounded-xl bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-500">WEIGHT TREND</p>
          <div className="flex items-end gap-1">
            {[68, 60, 55, 48, 42, 38, 35, 30].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{ height: `${h}px`, background: i === 7 ? '#4fa77e' : '#e5e7eb' }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">8 weeks</span>
            <span className="text-xs font-bold text-[#4fa77e]">-18.2 lbs</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: 'Meds', v: '2 active', c: '#4fa77e' },
            { l: 'Next Visit', v: 'Mar 22', c: '#3b82f6' },
            { l: 'Streak', v: '14 days', c: '#f59e0b' },
          ].map((s) => (
            <div key={s.l} className="rounded-lg bg-gray-50 p-2 text-center">
              <p className="text-[10px] text-gray-400">{s.l}</p>
              <p className="text-xs font-bold" style={{ color: s.c }}>
                {s.v}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PatientPortalContent() {
  return (
    <PlatformPageLayout
      badge="PATIENT PORTAL"
      title="Everything your patients need, in one place"
      highlightedWord="patients need"
      subtitle="A mobile-first PWA where patients can message providers, track progress, manage medications, schedule telehealth visits, log vitals, and access their medical records."
      gradient="from-[#4fa77e] to-[#3d9470]"
      icon={Smartphone}
      mockup={<PatientPortalMockup />}
      capabilities={[
        'Progress tracking & gamification',
        'Medication reminders',
        'Telehealth video visits',
        'Wearable device sync',
        'In-app symptom checker',
        'Secure document access',
        'Care team messaging',
        'Appointment scheduling',
        'Vitals logging',
      ]}
      features={[
        {
          title: 'Progress Tracking',
          description:
            'Patients see real-time charts of their weight, vitals, and wellness goals with streak tracking and achievement badges.',
        },
        {
          title: 'Medication Management',
          description:
            'View active prescriptions, receive refill reminders, and track shipment status from pharmacy to doorstep.',
        },
        {
          title: 'Telehealth Visits',
          description:
            'Zoom-integrated video consultations directly from the portal with pre-visit intake forms and post-visit summaries.',
        },
        {
          title: 'Wearable Sync',
          description:
            'Connects with Apple Health, Google Fit, and Fitbit to automatically log steps, heart rate, sleep, and more.',
        },
        {
          title: 'Secure Messaging',
          description:
            'HIPAA-compliant messaging between patients and their care team with read receipts and file attachments.',
        },
        {
          title: 'Mobile-First PWA',
          description:
            'Installable progressive web app that works offline, loads instantly, and feels native on any device.',
        },
      ]}
    />
  );
}
