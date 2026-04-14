'use client';

import { useTimerContext } from '@/app/wellmedr-checkout/providers/TimerProvider';

interface HeaderCountdownStripeProps {
  firstName?: string;
}

export default function HeaderCountdownStripe({
  firstName = 'Amanda',
}: HeaderCountdownStripeProps) {
  const { formattedTime: timer } = useTimerContext();

  return (
    <div className="-mx-6 flex h-[40px] w-[calc(100%+3rem)] items-center justify-center overflow-hidden sm:-mx-8 sm:w-[calc(100%+4rem)]">
      <div className="bg-rainbow flex h-full w-full items-center justify-center py-2.5">
        <p className="text-xs uppercase text-white sm:text-base">
          {firstName}’s approval is valid for {timer}
        </p>
      </div>
    </div>
  );
}
