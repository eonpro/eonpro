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
    <div className="w-[calc(100%+3rem)] -mx-6 sm:w-[calc(100%+4rem)] sm:-mx-8 h-[40px] flex items-center justify-center overflow-hidden">
      <div className="h-full py-2.5 flex items-center justify-center bg-rainbow w-full">
        <p className="uppercase text-xs sm:text-base text-white">
          {firstName}’s approval is valid for {timer}
        </p>
      </div>
    </div>
  );
}
