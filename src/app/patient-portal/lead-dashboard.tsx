'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Sparkles,
  BookOpen,
  Gift,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

interface DraftInfo {
  sessionId: string;
  currentStep: string;
  completedSteps: string[];
  progressPercent: number;
  templateName: string;
}

interface LeadDashboardProps {
  displayName: string;
  clinicName: string;
  clinicSlug: string;
}

export default function LeadDashboard({
  displayName,
  clinicName,
  clinicSlug,
}: LeadDashboardProps) {
  const [draft, setDraft] = useState<DraftInfo | null>(null);

  useEffect(() => {
    async function loadDraft() {
      try {
        const res = await fetch('/api/patient-portal/intake/drafts');
        if (res.ok) {
          const data = await res.json();
          if (data.drafts?.length > 0) {
            setDraft(data.drafts[0]);
          }
        }
      } catch (err) {
        console.warn('[LeadDashboard] Draft loading failed', err);
      }
    }
    loadDraft();
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{displayName ? `, ${displayName}` : ''}
        </h1>
        <p className="text-gray-500 mt-1">
          Let&apos;s get you started with {clinicName}
        </p>
      </div>

      {/* Intake CTA — Hero */}
      <div className="rounded-2xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-indigo-100">
            <ClipboardList className="w-7 h-7 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {draft ? 'Continue Your Intake' : 'Complete Your Intake'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {draft
                ? `You're ${draft.progressPercent}% done. Pick up where you left off.`
                : 'Tell us about your health goals so we can find the best treatment for you.'}
            </p>

            {draft && (
              <div className="mt-3">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${draft.progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {draft.progressPercent}% complete
                </p>
              </div>
            )}

            <Link
              href="/patient-portal/intake"
              className="
                inline-flex items-center gap-2 mt-4 px-5 py-2.5
                bg-indigo-600 text-white font-medium text-sm rounded-full
                hover:bg-indigo-700 transition-colors
              "
            >
              {draft ? 'Continue' : 'Start Now'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-gray-900">How It Works</h3>
        <div className="grid gap-3">
          {[
            { step: '1', text: 'Complete your medical intake questionnaire' },
            { step: '2', text: 'A licensed provider reviews your information' },
            { step: '3', text: 'Receive your personalized treatment plan' },
            { step: '4', text: 'Medication shipped directly to your door' },
          ].map((item) => (
            <div
              key={item.step}
              className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"
            >
              <div className="w-8 h-8 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                {item.step}
              </div>
              <span className="text-sm text-gray-700">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/patient-portal/treatments"
          className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <Sparkles className="w-5 h-5 text-amber-500" />
          <span className="text-sm font-medium text-gray-700">Treatments</span>
        </Link>
        <Link
          href="/patient-portal/specials"
          className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <Gift className="w-5 h-5 text-rose-500" />
          <span className="text-sm font-medium text-gray-700">Specials</span>
        </Link>
        <Link
          href="/patient-portal/resources"
          className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <BookOpen className="w-5 h-5 text-teal-500" />
          <span className="text-sm font-medium text-gray-700">Resources</span>
        </Link>
      </div>

      {/* Trust Signals */}
      <div className="rounded-xl bg-gray-50 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Why patients trust {clinicName}
        </h3>
        {[
          'Licensed medical providers',
          'FDA-approved medications',
          'HIPAA-compliant platform',
          'Personalized treatment plans',
        ].map((item) => (
          <div key={item} className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-gray-600">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
