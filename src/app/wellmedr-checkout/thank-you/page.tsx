'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect, useRef } from 'react';
import Header from '../components/ui/Header';
import UpsellModal from './components/UpsellModal';
import { PATIENT_DATA_KEY, SUBSCRIPTION_ID_KEY, AIRTABLE_RECORD_KEY } from '@/app/wellmedr-checkout/lib/session-keys';

function ThankYouContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid') || '';

  // Read PII from sessionStorage, not URL params (HIPAA compliance)
  let firstName = '';
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(PATIENT_DATA_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        firstName = data.firstName || '';
      }
    } catch {
      /* ignore */
    }
  }

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<{ brand: string; last4: string } | undefined>();
  const [showUpsell, setShowUpsell] = useState(false);
  const [glp1Details, setGlp1Details] = useState('');
  const [glp1Status, setGlp1Status] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const verifiedRef = useRef(false);

  // Verify payment and check for upsell eligibility
  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    const subscriptionId =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(SUBSCRIPTION_ID_KEY)
        : null;

    if (!subscriptionId) return;

    const verifySession = async () => {
      try {
        const res = await fetch(
          `/api/wellmedr/verify-session?subscription_id=${encodeURIComponent(subscriptionId)}`
        );
        const data = await res.json();

        if (data.success && data.customerId) {
          setCustomerId(data.customerId);
          if (data.paymentMethod) setPaymentMethod(data.paymentMethod);

          const completed = localStorage.getItem(`upsell_completed_${subscriptionId}`);
          const stepDone = localStorage.getItem(`upsell_step_${subscriptionId}`) === 'done';
          if (!completed && !stepDone) {
            setShowUpsell(true);
          }
        }
      } catch {
        /* non-critical */
      }
    };

    verifySession();
  }, []);

  const handleGlp1Submit = async () => {
    if (!glp1Details.trim()) return;

    const airtableRecordId =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(AIRTABLE_RECORD_KEY)
        : null;
    if (!airtableRecordId) return;

    setGlp1Status('submitting');
    try {
      const res = await fetch('/api/wellmedr/update-glp1-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airtableRecordId, details: glp1Details.trim() }),
      });
      if (res.ok) setGlp1Status('submitted');
      else setGlp1Status('idle');
    } catch {
      setGlp1Status('idle');
    }
  };

  return (
    <div className="wellmedr-checkout min-h-screen">
      <Header />

      {showUpsell && customerId && (
        <UpsellModal
          customerId={customerId}
          subscriptionId={
            (typeof sessionStorage !== 'undefined'
              ? sessionStorage.getItem(SUBSCRIPTION_ID_KEY)
              : null) || customerId
          }
          paymentMethod={paymentMethod}
          onClose={() => setShowUpsell(false)}
        />
      )}

      <main className="relative flex min-h-[60svh] w-full flex-col items-center justify-center px-6 pb-[env(safe-area-inset-bottom)] pt-12 sm:px-8">
        <div className="flex max-w-lg flex-col items-center gap-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-[#d6d6d6] bg-white">
            <svg className="h-7 w-7 text-[#7b95a9]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-medium tracking-tight sm:text-4xl">
              Thank you{firstName ? `, ${firstName}` : ''}!
            </h1>
            <p className="mx-auto max-w-sm text-base text-gray-600 sm:text-lg">
              Your intake has been successfully submitted and is now pending review by our medical
              team.
              <br />
              <br />
              We&apos;re excited to be part of your wellness journey — here&apos;s to feeling your
              best every day!
            </p>
          </div>

          {/* GLP-1 Dosage Capture */}
          {glp1Status !== 'submitted' && (
            <div className="w-full rounded-xl bg-[#f0f4f7] p-5 text-left">
              <p className="mb-3 text-sm text-gray-600">
                Please specify your current GLP-1 dosage below. A licensed clinician will review
                your information and determine the appropriate dosage.
              </p>
              <label htmlFor="glp1-details" className="sr-only">Current GLP-1 dosage</label>
              <textarea
                id="glp1-details"
                value={glp1Details}
                onChange={(e) => setGlp1Details(e.target.value)}
                placeholder="e.g. Ozempic 0.5mg for 3 months"
                className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-[#7b95a9]"
                rows={3}
                maxLength={1000}
              />
              <button
                onClick={handleGlp1Submit}
                disabled={glp1Status === 'submitting' || !glp1Details.trim()}
                className="mt-3 w-full rounded-full py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#0c2631' }}
              >
                {glp1Status === 'submitting' ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          )}
          {glp1Status === 'submitted' && (
            <div className="w-full rounded-xl bg-green-50 p-4 text-center">
              <p className="text-sm font-medium text-green-600">
                Previous GLP-1 details submitted. Thank you!
              </p>
            </div>
          )}

          <a
            href="https://www.wellmedr.com"
            className="inline-flex items-center justify-center gap-2 rounded-full px-12 py-4 font-medium text-white transition-all duration-300"
            style={{ backgroundColor: '#0c2631' }}
          >
            Take me home
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </main>
    </div>
  );
}

export default function WellmedrThankYouPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f7f9]" />}>
      <ThankYouContent />
    </Suspense>
  );
}
