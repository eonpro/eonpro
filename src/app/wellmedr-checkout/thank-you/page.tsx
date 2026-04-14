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
      <main className="relative flex min-h-[60svh] w-full flex-col items-center justify-center px-6 pt-12 sm:px-8">
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
