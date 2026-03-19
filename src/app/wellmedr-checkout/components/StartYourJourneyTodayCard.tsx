'use client';

import Image from 'next/image';
import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';
import { useTimerContext } from '@/app/wellmedr-checkout/providers/TimerProvider';
import Linear from '@/app/wellmedr-checkout/components/icons/Linear';
import UserSquare from '@/app/wellmedr-checkout/components/icons/UserSquare';
import Note from '@/app/wellmedr-checkout/components/icons/Note';
import Glass from '@/app/wellmedr-checkout/components/icons/Glass';
import Shipment from '@/app/wellmedr-checkout/components/icons/Shipment';

export default function StartYourJourneyTodayCard() {
  const { selectedProduct, products } = useCheckout();
  const { formattedTime: timer } = useTimerContext();

  if (!selectedProduct) return null;

  const product = products[selectedProduct.name] || products['semaglutide'];

  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full">
      <div className="rounded-smooth w-full h-auto aspect-square sm:aspect-auto sm:min-w-[360px] sm:min-h-[360px] relative">
        <Image
          fill
          src={product.pricing[selectedProduct.medicationType].image}
          alt={`Selected product`}
          sizes="(max-width: 640px) 100vw, 360px"
          className="object-cover object-center rounded-smooth"
          loading="lazy"
          placeholder="blur"
        />
      </div>

      <div className="card flex flex-col gap-4 justify-between">
        <div>
          <p className="text-base sm:text-lg mb-2">
            You are approved for{' '}
            <span className="font-medium text-primary">{timer}</span>
          </p>

          <h3 className="checkout-title mb-0">Start your journey today!</h3>
        </div>

        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex gap-4 items-start">
            <Linear width={24} height={24} className="mt-0.5" />
            <span className="label text-base sm:text-[1.125rem]">
              Lose up to 24% of your weight
            </span>
          </div>
          <div className="flex gap-4 items-start">
            <UserSquare width={24} height={24} className="mt-0.5" />
            <span className="label text-base sm:text-[1.125rem]">
              Physician guide
            </span>
          </div>
          <div className="flex gap-4 items-start">
            <Note width={24} height={24} className="mt-0.5" />
            <span className="label text-base sm:text-[1.125rem]">
              No insurance necessary
            </span>
          </div>
          <div className="flex gap-4 items-start">
            <Glass width={24} height={24} className="mt-0.5" />
            <span className="label text-base sm:text-[1.125rem]">
              Lab tested for quality to promote patient safety
            </span>
          </div>
          <div className="flex gap-4 items-start">
            <Shipment width={24} height={24} className="mt-0.5" />
            <span className="label text-base sm:text-[1.125rem]">
              Free 2-day shipping, if prescribed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
