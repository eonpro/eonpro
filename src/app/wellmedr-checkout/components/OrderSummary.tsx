'use client';

import { useFormContext } from 'react-hook-form';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';
import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';

export default function OrderSummary() {
  const { watch } = useFormContext<CheckoutFormData>();
  const { addonTotal } = useCheckout();

  const planDetails = watch('planDetails');
  const selectedProduct = watch('selectedProduct');
  const discountAmount = watch('discountAmount') || 0;

  if (!planDetails || !selectedProduct) return null;

  const productLabel = selectedProduct.name === 'tirzepatide' ? 'Tirzepatide' : 'Semaglutide';
  const planLabel = planDetails.title.replace('PLAN', 'Plan');
  const months =
    planDetails.plan_type === 'annual'
      ? 12
      : planDetails.plan_type === 'sixMonth'
        ? 6
        : planDetails.plan_type === 'quarterly'
          ? 3
          : 1;
  const perDay = (planDetails.totalPayToday / (months * 30)).toFixed(2);
  const careCoordFee = 19.99;
  const newPatientDiscount = -150;
  const subtotal =
    planDetails.totalPayToday + careCoordFee + newPatientDiscount + addonTotal - discountAmount;

  return (
    <div className="w-full">
      {/* FSA/HSA Banner */}
      <div className="mb-4 rounded-xl bg-green-500 px-4 py-2.5 text-center text-sm font-medium text-white">
        FSA/HSA eligible for reimbursement
      </div>

      {/* Product summary */}
      <div className="mb-4 flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/images/products/image-6.png"
          alt=""
          className="h-14 w-14 object-contain"
        />
        <div className="flex-1">
          <p className="text-sm font-bold text-green-600">
            {productLabel} {planLabel}
          </p>
          <p className="text-xs text-green-600">Most Affordable</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">As low as</p>
          <p className="text-lg font-bold">
            ${perDay}
            <span className="text-sm font-normal text-gray-500">/day</span>
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {[
          'Flexible month-to-month',
          'Clinically proven',
          "Results or you don't pay",
          'No long-term commitment',
        ].map((f, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-green-500">●</span> {f}
          </span>
        ))}
      </div>

      {/* Guarantee image */}
      <div className="mb-4 flex justify-end">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/images/products/c9eaaa59-008d-4430-816e-7501a58aec6b.png"
          alt="Guarantee"
          className="h-16 w-16 object-contain"
        />
      </div>

      <p className="mb-1 text-sm font-bold" style={{ color: '#101010' }}>
        Same price for the life of your plan, no month-2 increases or future price hikes.
      </p>
      <p className="mb-4 text-xs text-gray-500">
        Used to a specific dose? No worries — your price stays the same at any prescribed dose.
      </p>

      {/* Line items */}
      <div className="space-y-2 border-t pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {months > 1 ? `${months}-Month` : 'Monthly'} Treatment Package
              {planDetails.isBestValue ? ' (Best Value)' : ''}
            </p>
            <p className="text-xs text-gray-500">
              One-time payment · Covers {months > 1 ? `${months} months` : '1 month'} of medication
            </p>
          </div>
          <div className="shrink-0 text-right">
            {planDetails.originalPrice && (
              <span className="mr-1 text-xs text-gray-400 line-through">
                ${planDetails.originalPrice * months}
              </span>
            )}
            <span className="font-bold">${planDetails.totalPayToday.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">Care Coordination Fee</p>
            <p className="text-xs text-gray-500">
              Priority clinician review, injection supplies, and direct access to our care team
            </p>
          </div>
          <span className="shrink-0 font-medium">${careCoordFee}</span>
        </div>

        <div className="flex justify-between text-green-600">
          <p className="font-medium">New Patient Discount</p>
          <span className="font-medium">-$150</span>
        </div>

        <div className="flex justify-between">
          <p className="font-medium">Overnight Shipping</p>
          <div className="text-right">
            <span className="mr-1 text-xs text-gray-400 line-through">$19.99</span>
            <span className="font-bold text-green-600">FREE</span>
          </div>
        </div>

        <div className="flex justify-between text-xs">
          <p>Protected by Weight Loss Warranty</p>
          <span className="font-medium text-green-600">Activated</span>
        </div>
      </div>

      {/* Total */}
      <div className="mt-4 flex items-baseline justify-between border-t pt-4">
        <div>
          <p className="text-lg font-bold">Total Due Today</p>
          <p className="text-xs font-medium text-green-600">You save $150!</p>
        </div>
        <div className="text-right">
          {planDetails.originalPrice && (
            <span className="mr-2 text-sm text-gray-400 line-through">
              ${(planDetails.totalPayToday + 150).toLocaleString()}
            </span>
          )}
          <span className="text-2xl font-bold">
            $
            {subtotal > 0
              ? subtotal.toLocaleString(undefined, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })
              : '0'}
          </span>
          <p className="text-xs text-gray-500">${perDay}/day</p>
        </div>
      </div>

      {/* FedEx badge */}
      <div className="mb-6 mt-4 flex items-center gap-2">
        <span className="text-sm font-bold" style={{ color: '#4D148C' }}>
          FedEx
        </span>
        <span className="text-xs text-gray-500">Est. Delivery: Within 48 Hours</span>
      </div>

      {/* Benefits */}
      <div
        className="rounded-xl p-4"
        style={{ backgroundColor: '#fef9ef', border: '1px solid rgba(195,178,158,0.2)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: '#101010' }}>
            Your all-inclusive plan includes upgraded benefits:
          </p>
          <button className="text-gray-400 hover:text-gray-600" aria-label="Dismiss">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="space-y-0 divide-y divide-gray-200/60">
          {[
            {
              text: 'Unlimited Video Calls With Clinicians',
              price: '$129',
              img: '/assets/images/whats-included/consult.webp',
            },
            {
              text: 'Always On Medical Assistance via Phone',
              price: '$89',
              img: '/assets/images/whats-included/care.webp',
            },
            {
              text: '100% U.S. Based Care Agents',
              price: '$69',
              img: '/assets/images/products/commun.webp',
            },
            {
              text: 'On-Time Refills Guaranteed',
              price: '$49',
              img: '/assets/images/products/wellmedrtruck.webp',
            },
            {
              text: 'Access the WellMedr Member Community',
              price: '$29',
              img: '/assets/images/whats-included/commun.webp',
            },
            {
              text: 'WellMedr Weight Loss Warranty',
              price: null,
              img: '/assets/images/whats-included/warranty-badge.webp',
            },
          ].map((b, i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.img}
                  alt=""
                  className="h-12 w-12 rounded-lg bg-white object-contain p-1"
                  style={{ border: '1px solid rgba(0,0,0,0.06)' }}
                />
                <span className="text-sm font-medium" style={{ color: '#101010' }}>
                  {b.text}
                </span>
              </div>
              {b.price ? (
                <div className="shrink-0 text-right">
                  <span className="block text-xs text-gray-400 line-through">{b.price}</span>
                  <span className="text-xs font-bold text-green-600">FREE</span>
                </div>
              ) : (
                <span className="shrink-0 text-xs font-bold text-green-600">Activated</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Social proof */}
      <div className="mt-6 text-center">
        <p className="text-sm font-medium">
          Join <strong>200,000+</strong> weight loss members
        </p>
        <div className="mt-1 flex items-center justify-center gap-1">
          <div className="flex text-green-500">
            {'★★★★★'.split('').map((_, i) => (
              <span key={i} className="text-sm">
                ★
              </span>
            ))}
          </div>
          <span className="text-sm font-bold">Excellent 4.7</span>
        </div>
      </div>
    </div>
  );
}
