'use client';

import { useState, useEffect } from 'react';

import { Clock } from 'lucide-react';

interface CallTimerProps {
  startTime?: Date | null;
  scheduledDuration?: number;
  className?: string;
}

export default function CallTimer({ startTime, scheduledDuration, className = '' }: CallTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    const start = startTime.getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const formatted = hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const isOvertime = scheduledDuration && elapsed > scheduledDuration * 60;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Clock className={`h-4 w-4 ${isOvertime ? 'text-orange-500' : 'text-gray-400'}`} />
      <span className={`font-mono text-sm font-semibold tabular-nums ${isOvertime ? 'text-orange-600' : 'text-gray-700'}`}>
        {formatted}
      </span>
      {scheduledDuration && (
        <span className="text-xs text-gray-400">/ {scheduledDuration}min</span>
      )}
    </div>
  );
}
