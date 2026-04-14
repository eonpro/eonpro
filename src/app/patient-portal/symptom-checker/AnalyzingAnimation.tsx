'use client';

import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

const MESSAGES = [
  'Reviewing your symptoms',
  'Analyzing patterns',
  'Checking medical guidelines',
  'Preparing your assessment',
];

export default function AnalyzingAnimation({ primaryColor }: { primaryColor: string }) {
  const [dotCount, setDotCount] = useState(1);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 500);
    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 2500);
    return () => {
      clearInterval(dotInterval);
      clearInterval(msgInterval);
    };
  }, []);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center">
      <div className="relative mb-8">
        <div
          className="absolute inset-0 animate-ping rounded-full opacity-20"
          style={{ backgroundColor: primaryColor, animationDuration: '2s' }}
        />
        <div
          className="absolute inset-2 animate-ping rounded-full opacity-30"
          style={{ backgroundColor: primaryColor, animationDuration: '2s', animationDelay: '0.5s' }}
        />
        <div
          className="relative flex h-24 w-24 items-center justify-center rounded-full"
          style={{ backgroundColor: `${primaryColor}15` }}
        >
          <Sparkles className="h-10 w-10" style={{ color: primaryColor }} />
        </div>
      </div>
      <p className="text-lg font-bold text-gray-900">
        {MESSAGES[messageIndex]}
        {'.'.repeat(dotCount)}
      </p>
      <p className="mt-2 text-sm text-gray-400">This usually takes a few seconds</p>
    </div>
  );
}
