'use client';

import { Suspense } from 'react';
import { GLP1CheckoutPageImproved } from './components/GLP1CheckoutPageImproved';

function CheckoutLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#13a97b]" />
      <span className="ml-4 text-lg text-gray-600">Loading checkout...</span>
    </div>
  );
}

export default function EonmedsCheckoutPage() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <GLP1CheckoutPageImproved />
    </Suspense>
  );
}
