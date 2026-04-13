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
  const months = planDetails.plan_type === 'annual' ? 12 : planDetails.plan_type === 'sixMonth' ? 6 : planDetails.plan_type === 'quarterly' ? 3 : 1;
  const perDay = (planDetails.totalPayToday / (months * 30)).toFixed(2);
  const careCoordFee = 19.99;
  const newPatientDiscount = -150;
  const subtotal = planDetails.totalPayToday + careCoordFee + newPatientDiscount + addonTotal - discountAmount;

  return (
    <div className="w-full">
      {/* FSA/HSA Banner */}
      <div className="bg-green-500 text-white text-center py-2.5 px-4 rounded-xl mb-4 text-sm font-medium">
        FSA/HSA eligible for reimbursement
      </div>

      {/* Product summary */}
      <div className="flex items-start gap-3 mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/images/products/image-6.png" alt="" className="w-14 h-14 object-contain" />
        <div className="flex-1">
          <p className="font-bold text-green-600 text-sm">{productLabel} {planLabel}</p>
          <p className="text-green-600 text-xs">Most Affordable</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">As low as</p>
          <p className="font-bold text-lg">${perDay}<span className="text-sm font-normal text-gray-500">/day</span></p>
        </div>
      </div>

      {/* Features */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs">
        {['Flexible month-to-month', 'Clinically proven', 'Results or you don\'t pay', 'No long-term commitment'].map((f, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-green-500">●</span> {f}
          </span>
        ))}
      </div>

      {/* Guarantee image */}
      <div className="flex justify-end mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/images/products/c9eaaa59-008d-4430-816e-7501a58aec6b.png" alt="Guarantee" className="w-16 h-16 object-contain" />
      </div>

      <p className="text-sm font-bold mb-1" style={{ color: '#101010' }}>
        Same price for the life of your plan, no month-2 increases or future price hikes.
      </p>
      <p className="text-xs text-gray-500 mb-4">
        Used to a specific dose? No worries — your price stays the same at any prescribed dose.
      </p>

      {/* Line items */}
      <div className="border-t pt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <div>
            <p className="font-medium">{months > 1 ? `${months}-Month` : 'Monthly'} Treatment Package{planDetails.isBestValue ? ' (Best Value)' : ''}</p>
            <p className="text-xs text-gray-500">One-time payment · Covers {months > 1 ? `${months} months` : '1 month'} of medication</p>
          </div>
          <div className="text-right">
            {planDetails.originalPrice && <span className="line-through text-gray-400 text-xs mr-1">${planDetails.originalPrice * months}</span>}
            <span className="font-bold">${planDetails.totalPayToday.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-between">
          <div>
            <p className="font-medium">Care Coordination Fee</p>
            <p className="text-xs text-gray-500">Priority clinician review, injection supplies, and direct access to our care team</p>
          </div>
          <span className="font-medium">${careCoordFee}</span>
        </div>

        <div className="flex justify-between text-green-600">
          <p className="font-medium">New Patient Discount</p>
          <span className="font-medium">-$150</span>
        </div>

        <div className="flex justify-between">
          <p className="font-medium">Overnight Shipping</p>
          <div className="text-right">
            <span className="line-through text-gray-400 text-xs mr-1">$19.99</span>
            <span className="font-bold text-green-600">FREE</span>
          </div>
        </div>

        <div className="flex justify-between text-xs">
          <p>Protected by Weight Loss Warranty</p>
          <span className="text-green-600 font-medium">Activated</span>
        </div>
      </div>

      {/* Total */}
      <div className="border-t mt-4 pt-4 flex justify-between items-baseline">
        <div>
          <p className="font-bold text-lg">Total Due Today</p>
          <p className="text-xs text-green-600 font-medium">You save $150!</p>
        </div>
        <div className="text-right">
          {planDetails.originalPrice && (
            <span className="line-through text-gray-400 text-sm mr-2">${(planDetails.totalPayToday + 150).toLocaleString()}</span>
          )}
          <span className="font-bold text-2xl">${subtotal > 0 ? subtotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '0'}</span>
          <p className="text-xs text-gray-500">${perDay}/day</p>
        </div>
      </div>

      {/* FedEx badge */}
      <div className="flex items-center gap-2 mt-4 mb-6">
        <span className="font-bold text-sm" style={{ color: '#4D148C' }}>FedEx</span>
        <span className="text-xs text-gray-500">Est. Delivery: Within 48 Hours</span>
      </div>

      {/* Benefits */}
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="font-bold text-sm mb-3 text-center" style={{ color: '#101010' }}>
          Your all-inclusive plan includes upgraded benefits:
        </p>
        <div className="space-y-3">
          {[
            { text: 'Unlimited Video Calls With Clinicians', price: '$69' },
            { text: 'Always On Medical Assistance via Phone', price: '$69' },
            { text: '100% U.S. Based Care Agents', price: '$69' },
            { text: 'On-Time Refills Guaranteed', price: '$49' },
            { text: 'Access the WellMedR Member Community', price: '$29' },
            { text: 'WellMedR Weight Loss Warranty', price: null },
          ].map((b, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-sm">🎁</div>
                <span className="text-sm" style={{ color: '#101010' }}>{b.text}</span>
              </div>
              {b.price ? (
                <div className="text-right">
                  <span className="text-xs line-through text-gray-400 mr-1">{b.price}</span>
                  <span className="text-xs font-bold text-green-600">FREE</span>
                </div>
              ) : (
                <span className="text-xs font-medium text-green-600">Activated</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Social proof */}
      <div className="text-center mt-6">
        <p className="text-sm font-medium">Join <strong>200,000+</strong> weight loss members</p>
        <div className="flex items-center justify-center gap-1 mt-1">
          <div className="flex text-green-500">
            {'★★★★★'.split('').map((_, i) => (
              <span key={i} className="text-sm">★</span>
            ))}
          </div>
          <span className="text-sm font-bold">Excellent 4.7</span>
        </div>
      </div>
    </div>
  );
}
