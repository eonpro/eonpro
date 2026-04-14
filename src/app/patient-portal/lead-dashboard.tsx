'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Sparkles, BookOpen, Gift, ArrowRight, CheckCircle2 } from 'lucide-react';
import { portalFetch } from '@/lib/api/patient-portal-client';

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

export default function LeadDashboard({ displayName, clinicName, clinicSlug }: LeadDashboardProps) {
  const [draft, setDraft] = useState<DraftInfo | null>(null);

  useEffect(() => {
    async function loadDraft() {
      try {
        const res = await portalFetch('/api/patient-portal/intake/drafts');
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
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{displayName ? `, ${displayName}` : ''}
        </h1>
        <p className="mt-1 text-gray-500">Let&apos;s get you started with {clinicName}</p>
      </div>

      {/* Intake CTA — Hero */}
      <div className="rounded-2xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-indigo-100 p-3">
            <ClipboardList className="h-7 w-7 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {draft ? 'Continue Your Intake' : 'Complete Your Intake'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {draft
                ? `You're ${draft.progressPercent}% done. Pick up where you left off.`
                : 'Tell us about your health goals so we can find the best treatment for you.'}
            </p>

            {draft && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${draft.progressPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">{draft.progressPercent}% complete</p>
              </div>
            )}

            <Link
              href="/patient-portal/intake"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              {draft ? 'Continue' : 'Start Now'}
              <ArrowRight className="h-4 w-4" />
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
            <div key={item.step} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-200 bg-white text-sm font-bold text-gray-600">
                {item.step}
              </div>
              <span className="text-sm text-gray-700">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/patient-portal/treatments"
          className="flex items-center gap-3 rounded-xl border border-gray-100 p-4 transition-colors hover:border-gray-200 hover:bg-gray-50"
        >
          <Sparkles className="h-5 w-5 text-amber-500" />
          <span className="text-sm font-medium text-gray-700">Treatments</span>
        </Link>
        <Link
          href="/patient-portal/specials"
          className="flex items-center gap-3 rounded-xl border border-gray-100 p-4 transition-colors hover:border-gray-200 hover:bg-gray-50"
        >
          <Gift className="h-5 w-5 text-rose-500" />
          <span className="text-sm font-medium text-gray-700">Specials</span>
        </Link>
        <Link
          href="/patient-portal/resources"
          className="flex items-center gap-3 rounded-xl border border-gray-100 p-4 transition-colors hover:border-gray-200 hover:bg-gray-50"
        >
          <BookOpen className="h-5 w-5 text-teal-500" />
          <span className="text-sm font-medium text-gray-700">Resources</span>
        </Link>
      </div>

      {/* Trust Signals */}
      <div className="space-y-3 rounded-xl bg-gray-50 p-5">
        <h3 className="text-sm font-semibold text-gray-700">Why patients trust {clinicName}</h3>
        {[
          'Licensed medical providers',
          'FDA-approved medications',
          'HIPAA-compliant platform',
          'Personalized treatment plans',
        ].map((item) => (
          <div key={item} className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
            <span className="text-sm text-gray-600">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
