import { useTimerContext } from '@/app/wellmedr-checkout/providers/TimerProvider';
import React from 'react';

export default function PlansHeader() {
  const { formattedTime: timer } = useTimerContext();
  return (
    <div className="text-center">
      <h3 className="">Choose what's best for you</h3>
      <p>
        Your approval is reserved for{' '}
        <span className="text-primary">{timer}</span>
      </p>
    </div>
  );
}
