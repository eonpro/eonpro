'use client';

import CheckboxWithText from '@/app/wellmedr-checkout/components/ui/CheckboxWithText';
import Image from 'next/image';
import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';
import Star from '@/app/wellmedr-checkout/components/icons/Star';

const SelectedProductCard = () => {
  const { selectedProduct, selectedPlan, plans, products } = useCheckout();

  if (!selectedProduct) return null;

  const productInfo = products[selectedProduct.name];
  const selectedPlanDetails = plans.find((p) => p.id === selectedPlan);
  const isQuarterly = selectedPlanDetails?.plan_type === 'quarterly';

  const displayPrice = isQuarterly
    ? selectedPlanDetails?.totalPayToday || 0
    : selectedPlanDetails?.monthlyPrice ||
      productInfo.pricing[selectedProduct.medicationType].monthlyPrice;
  const frequencyLabel = isQuarterly ? 'per 3 months' : 'per month';

  return (
    <div id="selected-product-card" className="card relative flex flex-col sm:flex-row sm:gap-10">
      {/* Absolute Badge */}
      <div className="bg-rainbow absolute left-6 top-6 z-10 flex w-fit items-center justify-center gap-1.5 rounded-full px-3 py-2 text-white">
        <Star />
        <span className="text-sm font-medium tracking-[1%]">Most Popular</span>
      </div>
      {/* Image */}
      <div className="relative flex w-full flex-col items-center justify-center bg-[radial-gradient(circle,var(--color-secondary),#ffffff_25%,#ffffff_100%)] text-center sm:flex-1">
        <Image
          src={productInfo.pricing[selectedProduct.medicationType].rotatedImage}
          alt={`${selectedProduct.name} product`}
          width={300}
          height={300}
          className="object-cover object-center"
        />
        <div className="hidden sm:block">
          <p className="text-sm sm:text-lg">Everything you need</p>
          <p className="text-sm sm:text-lg">+ free shipping</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-4 sm:flex-1">
        <div>
          <h3 className="card-title text-center sm:text-left">
            Continue with{' '}
            <span className="inline sm:hidden">
              <br />
            </span>
            <span className="italic-primary">
              <span className="capitalize">{selectedProduct.name}</span>{' '}
              {selectedProduct.medicationType}
            </span>{' '}
            <span>
              <br />
            </span>
            for ${displayPrice} {frequencyLabel}
          </h3>

          <div className="block text-center sm:hidden">
            <p className="text-base sm:text-lg">Everything you need + free shipping</p>
          </div>
        </div>

        <CheckboxWithText>
          One month of medication, supplies, and step-by-step instructions
        </CheckboxWithText>
        <CheckboxWithText>Cancel anytime, come back anytime</CheckboxWithText>
        <CheckboxWithText>24/7 medical support</CheckboxWithText>
        <CheckboxWithText>
          Save over <span className="font-semibold">$100</span> on your monthly plan
        </CheckboxWithText>
        <CheckboxWithText>Personalized, one-on-one care from our physicians</CheckboxWithText>
        <CheckboxWithText>
          Ongoing support – as much or as little as you need along the way
        </CheckboxWithText>
      </div>
    </div>
  );
};

export default SelectedProductCard;
