'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Header from '../components/ui/Header';

function ThankYouContent() {
  const searchParams = useSearchParams();
  const firstName = searchParams.get('firstName') || '';

  return (
    <div className="wellmedr-checkout min-h-screen">
      <Header />
      <main className="relative flex flex-col items-center justify-center w-full min-h-[60svh] px-6 sm:px-8 pt-12">
        <div className="max-w-lg text-center flex flex-col items-center gap-6">
          <div className="w-14 h-14 bg-white border border-[#d6d6d6] rounded-[20px] flex items-center justify-center">
            <svg className="w-7 h-7 text-[#7b95a9]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">
              Thank you{firstName ? `, ${firstName}` : ''}!
            </h1>
            <p className="text-base sm:text-lg text-gray-600 max-w-sm mx-auto">
              Your intake has been successfully submitted and is now pending review by our medical team.
              <br /><br />
              We&apos;re excited to be part of your wellness journey — here&apos;s to feeling your best every day!
            </p>
          </div>

          <a
            href="https://www.wellmedr.com"
            className="inline-flex items-center justify-center gap-2 rounded-full py-4 px-12 text-white font-medium transition-all duration-300"
            style={{ backgroundColor: '#0c2631' }}
          >
            Take me home
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
