'use client';

interface VerifiedBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

const sizeMap = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
};

export default function VerifiedBadge({ size = 'sm', className = '' }: VerifiedBadgeProps) {
  return (
    <span title="Identity Verified" className={`inline-flex shrink-0 items-center ${className}`}>
      <svg
        viewBox="0 0 22 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={sizeMap[size]}
      >
        {/* Outer badge shape (star-burst / verified seal) */}
        <path
          d="M11 0l2.39 3.66L17.5 2.5l-.16 4.38 4.16 1.41-2.82 3.32 2.82 3.32-4.16 1.41.16 4.38-4.11-1.16L11 22l-2.39-3.66L4.5 19.5l.16-4.38L.5 13.71l2.82-3.32L.5 7.07l4.16-1.41-.16-4.38 4.11 1.16L11 0z"
          fill="#1D9BF0"
        />
        {/* White checkmark */}
        <path
          d="M9.5 14.25l-2.75-2.75-1.06 1.06L9.5 16.37l7.31-7.31-1.06-1.06L9.5 14.25z"
          fill="#fff"
        />
      </svg>
    </span>
  );
}
