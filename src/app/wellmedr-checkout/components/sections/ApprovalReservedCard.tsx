'use client';

import PatternBgCard from '@/app/wellmedr-checkout/components/ui/PatternBgCard';
import { useTimerContext } from '@/app/wellmedr-checkout/providers/TimerProvider';

export default function ApprovalReservedCard() {
  const { formattedTime: timer } = useTimerContext();
  return (
    <PatternBgCard className="flex h-auto w-full flex-col gap-8 px-6 py-12 text-center sm:h-auto">
      <p>
        <span className="text-base">Your approval is reserved for</span>{' '}
        <span className="text-lg font-medium">{timer}</span>
      </p>
      <h3 className="text-3xl sm:text-[2rem]">
        Save Over $100 <br />
        <span className="font-serif italic underline underline-offset-2">Instantly</span>
      </h3>

      <div>
        <p className="text-base sm:text-lg">Pay one month at a time.</p>
        <p className="text-base sm:text-lg">
          No contracts, cancel anytime without speaking to anyone.
        </p>
      </div>

      <p className="font-medium sm:text-lg">
        24/7 Support + unlimited doctor visits + medication{' '}
        <span className="italic">all included</span>
      </p>

      <p className="font-medium">Choose your medication preference below:</p>
    </PatternBgCard>
  );
}
