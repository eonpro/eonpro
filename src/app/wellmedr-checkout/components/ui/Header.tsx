'use client';

import { useContext } from 'react';
import Logo from '../icons/Logo';

// Import the context directly to avoid the throwing hook on standalone pages
// (payment-return, thank-you) that render outside CheckoutStepProvider.
import { CheckoutStepContext } from '@/app/wellmedr-checkout/providers/CheckoutStepProvider';

const Header = () => {
  const ctx = useContext(CheckoutStepContext);
  const currentStep = ctx?.currentStep ?? 'payment';
  const isPaymentPhase = currentStep === 'approval' || currentStep === 'payment';
  const badgeLabel = isPaymentPhase ? 'SECURE PAYMENT' : 'SECURE CHECKOUT';

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
      <a href="/" className="h-[24px] w-[160px] sm:h-[28px] sm:w-[200px]">
        <Logo className="h-full w-full" aria-label="Wellmedr Logo" />
      </a>

      <div className="flex items-center gap-4 sm:gap-6">
        {isPaymentPhase && (
          <>
            <a href="tel:18883976905" className="text-gray-600 sm:hidden" aria-label="Call support">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>
            <div className="hidden text-right sm:block">
              <p className="text-xs text-gray-500">Questions? Call us</p>
              <p className="text-sm font-bold" style={{ color: '#101010' }}>
                1-888-397-6905
              </p>
            </div>
          </>
        )}
        <div
          className="flex items-center gap-1.5 rounded-md border px-3 py-2"
          style={{ borderColor: 'rgba(0,0,0,0.1)' }}
        >
          <svg className="h-4 w-4" style={{ color: '#0C2631' }} fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex flex-col leading-none">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#101010' }}>
              {badgeLabel.split(' ')[0]}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#101010' }}>
              {badgeLabel.split(' ')[1]}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
