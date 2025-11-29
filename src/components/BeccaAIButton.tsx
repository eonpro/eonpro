'use client';

import { useState, useEffect } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

interface BeccaAIButtonProps {
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
  showPulse?: boolean;
  className?: string;
}

export default function BeccaAIButton({
  onClick,
  size = 'medium',
  showPulse = true,
  className = '',
}: BeccaAIButtonProps) {
  const [loadError, setLoadError] = useState(false);
  
  const sizeClasses = {
    small: 'w-16 h-16',
    medium: 'w-20 h-20',
    large: 'w-24 h-24',
  };

  const iconSizes = {
    small: 'w-7 h-7',
    medium: 'w-10 h-10',
    large: 'w-12 h-12',
  };

  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer hover:scale-110 transition-transform ${sizeClasses[size]} ${className} flex items-center justify-center`}
      title="Becca AI Assistant"
    >
      {!loadError ? (
        <DotLottieReact
          src="https://lottie.host/9c7564a3-b6ee-4e8b-8b5e-14a59b28c515/3Htnjbp08p.lottie"
          loop
          autoplay
          style={{ width: '100%', height: '100%' }}
          onError={() => setLoadError(true)}
        />
      ) : (
        // Fallback icon if Lottie fails to load
        <div className="bg-white rounded-full shadow-lg border-2 border-green-500 p-3 flex items-center justify-center">
          <svg 
            className={`${iconSizes[size]} text-green-600`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z" 
            />
          </svg>
        </div>
      )}
      {showPulse && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse z-10"></span>
      )}
    </div>
  );
}
