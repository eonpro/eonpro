'use client';

import { useFormContext } from 'react-hook-form';
import { useState, useEffect, useMemo } from 'react';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';
import { api } from '@/app/wellmedr-checkout/utils/api';
import PromoCodeIcon from '@/app/wellmedr-checkout/components/icons/PromoCode';
import Button from '@/app/wellmedr-checkout/components/ui/button/Button';
import { logger } from '@/app/wellmedr-checkout/utils/logger';

interface Discount {
  code: string;
  promotionCodeId: string;
  discountPercentage: number;
  discountAmount: number;
  label: string;
}

// Props are now optional since subscription is created on submit
// Promo codes are validated and stored in form state, then applied during subscription creation
interface PromoCodeSectionProps {
  subscriptionId?: string | null;
  onPromoApplied?: (result: { clientSecret?: string; status?: string }) => void;
}

const PromoCodeSection = ({ subscriptionId, onPromoApplied }: PromoCodeSectionProps = {}) => {
  const { setValue, getValues, watch } = useFormContext<CheckoutFormData>();

  // Watch form values to restore state after remount
  const formPromoCode = watch('promoCode');
  const formPromotionCodeId = watch('promotionCodeId');
  const formDiscountPercentage = watch('discountPercentage');
  const formDiscountAmount = watch('discountAmount');

  const [isApplying, setIsApplying] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState<Discount | null>(
    // Initialize from form state if promo was already applied
    formPromotionCodeId
      ? {
          code: formPromoCode || '',
          promotionCodeId: formPromotionCodeId,
          discountPercentage: formDiscountPercentage || 0,
          discountAmount: formDiscountAmount || 0,
          label:
            formDiscountPercentage && formDiscountPercentage > 0
              ? `${formDiscountPercentage}% OFF`
              : formDiscountAmount && formDiscountAmount > 0
                ? `$${formDiscountAmount.toFixed(0)} OFF`
                : '',
        }
      : null
  );
  const [error, setError] = useState<string | null>(null);
  const [lastAppliedCode, setLastAppliedCode] = useState<string>(formPromoCode || '');
  const [promoCode, setPromoCode] = useState<string>(formPromoCode || '');
  const [discountLabel, setDiscountLabel] = useState<string | undefined>(
    formPromotionCodeId
      ? formDiscountPercentage && formDiscountPercentage > 0
        ? `${formDiscountPercentage}% OFF`
        : formDiscountAmount && formDiscountAmount > 0
          ? `$${formDiscountAmount.toFixed(0)} OFF`
          : undefined
      : undefined
  );
  const [buttonContent, setButtonContent] = useState<string | React.ReactNode>(
    formPromotionCodeId ? 'Applied!' : 'Apply'
  );

  const productName = getValues('selectedProduct')?.name;
  const medicationType = getValues('selectedProduct')?.medicationType;
  const planType = getValues('planDetails')?.plan_type;
  const formTarget = getValues('formTarget');

  // Mask function to convert input to uppercase
  const uppercaseMask = (value: string) => value.toUpperCase();

  const handleApply = async () => {
    const trimmedCode = promoCode.trim();

    if (!trimmedCode) {
      setError('Please enter a promo code.');
      return;
    }

    setError(null);
    setIsApplying(true);

    try {
      // Call the API to check promo code
      //const response = await api.checkPromoCode(trimmedCode, productName, medicationType, planType, formTarget)
      const response = await api.post('promo-code/check', {
        promoCode: trimmedCode,
        productName: productName,
        medicationType: medicationType,
        planType: planType,
        formTarget: formTarget,
      });

      if (response.success && response.data) {
        const validDiscount: Discount = {
          code: response.data.code,
          promotionCodeId: response.data.promotionCodeId,
          discountPercentage: response.data.discountPercentage,
          discountAmount: response.data.discountAmount,
          label: response.data.label,
        };

        // If we have an existing subscription, apply the promo code to it
        if (subscriptionId) {
          try {
            const email = getValues('email') || '';
            const applyResponse = await api.post('apply-promo-code', {
              subscriptionId,
              promotionCodeId: validDiscount.promotionCodeId,
              customerEmail: email,
            });

            if (applyResponse.success) {
              // Notify parent of the updated subscription data
              onPromoApplied?.({
                clientSecret: applyResponse.data?.clientSecret,
                status: applyResponse.data?.status,
              });
            } else {
              throw new Error(applyResponse.error || 'Failed to apply promo code to subscription');
            }
          } catch (applyError: any) {
            logger.error('Error applying promo code to subscription:', applyError);
            setError(applyError?.message || 'Failed to apply promo code. Please try again.');
            setIsApplying(false);
            return;
          }
        }

        setAppliedDiscount(validDiscount);
        setDiscountLabel(validDiscount.label);
        setLastAppliedCode(trimmedCode);
        setButtonContent('Applied!');
        setValue('discountPercentage', validDiscount.discountPercentage, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        setValue('discountAmount', validDiscount.discountAmount, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        setValue('promotionCodeId', validDiscount.promotionCodeId, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
      } else {
        // Invalid promo code
        setAppliedDiscount(null);
        setButtonContent('Apply');
        setValue('discountPercentage', undefined, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        setValue('discountAmount', undefined, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        setValue('promotionCodeId', undefined, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
        const errorMessage = response.data?.message || 'Invalid promo code.';
        setError(errorMessage);
        setDiscountLabel(undefined);
      }
    } catch (error) {
      // Handle network or other errors
      setAppliedDiscount(null);
      setButtonContent('Apply');
      setValue('discountPercentage', undefined, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
      setValue('discountAmount', undefined, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
      setValue('promotionCodeId', undefined, {
        shouldValidate: true,
        shouldDirty: true,
        shouldTouch: true,
      });
      setError('Failed to validate promo code. Please try again.');
      setDiscountLabel(undefined);
    }

    setIsApplying(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isButtonDisabled) {
      e.preventDefault();
      e.stopPropagation(); // Prevent form submission
      handleApply();
    }
  };

  useEffect(() => {
    if (appliedDiscount && promoCode.trim() === lastAppliedCode) {
      setButtonContent('Applied!');
    } else if (isApplying) {
      setButtonContent('Applying...');
    } else {
      setButtonContent('Apply');
      // Don't clear discountLabel here - it's handled in onChange
    }
  }, [appliedDiscount, promoCode, lastAppliedCode, isApplying]);

  const isButtonDisabled = useMemo(
    () =>
      isApplying ||
      !promoCode.trim() ||
      (!!appliedDiscount && promoCode.trim() === lastAppliedCode),
    [isApplying, promoCode, appliedDiscount, lastAppliedCode]
  );

  return (
    <div className="w-full space-y-3">
      <div className="flex w-full items-end gap-3">
        <div className="flex-1">
          <div className="flex w-full max-w-2xl flex-col gap-2">
            <label htmlFor="promo-code-input" className="form-label">
              Promo code
            </label>
            <div className="relative">
              <div className="text-foreground absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 transform sm:left-6">
                <PromoCodeIcon className="h-full w-full" />
              </div>
              <input
                id="promo-code-input"
                type="text"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={(e) => {
                  const value = e.target.value;
                  const maskedValue = uppercaseMask(value);
                  setPromoCode(maskedValue);
                  setValue('promoCode', maskedValue, { shouldValidate: true });

                  // Only update local UI state when typing - don't clear form discount values
                  // This prevents Elements from remounting while user is typing
                  // Form values will be updated when a new code is applied
                  if (appliedDiscount && maskedValue.trim() !== lastAppliedCode) {
                    setAppliedDiscount(null);
                    setDiscountLabel(undefined);
                    setButtonContent('Apply');
                    // DON'T clear form discount values here - keep showing discounted price
                    // until user applies a new (possibly invalid) code
                  }
                }}
                onKeyDown={handleKeyDown}
                className="form-input w-full pl-12 sm:pl-14"
              />
              {discountLabel && (
                <div className="absolute bottom-2 right-4 z-0 transform sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
                  <div className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium uppercase text-green-700">
                    {discountLabel}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            text={buttonContent}
            onClick={handleApply}
            disabled={isButtonDisabled}
            className="h-[64px] min-w-[120px]"
            variant="outline"
            suffix={null}
          />
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-500" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

export default PromoCodeSection;
