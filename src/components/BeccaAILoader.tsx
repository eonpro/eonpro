'use client';

import { DotLottieReact } from '@lottiefiles/dotlottie-react';

interface BeccaAILoaderProps {
  text?: string;
  subText?: string;
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
}

export default function BeccaAILoader({
  text = 'Processing...',
  subText,
  size = 'medium',
  fullScreen = false,
}: BeccaAILoaderProps) {
  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-24 h-24',
    large: 'w-32 h-32',
  };

  const content = (
    <div className="flex flex-col items-center space-y-4">
      <div className={sizeClasses[size]}>
        <DotLottieReact
          src="https://lottie.host/9c7564a3-b6ee-4e8b-8b5e-14a59b28c515/3Htnjbp08p.lottie"
          loop
          autoplay
        />
      </div>
      {(text || subText) && (
        <div className="text-center">
          {text && <h3 className="mb-1 text-lg font-semibold">{text}</h3>}
          {subText && <p className="text-sm text-gray-600">{subText}</p>}
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="rounded-lg bg-white p-8">{content}</div>
      </div>
    );
  }

  return content;
}
