import cn from '@/app/wellmedr-checkout/lib/cn';
import { ReactNode } from 'react';

interface CheckboxWithTextProps {
  children: ReactNode;
  className?: string;
}

export default function CheckboxWithText({
  children,
  className,
}: CheckboxWithTextProps) {
  return (
    <div className={cn('flex items-start gap-4', className)}>
      <div className="shrink-0 w-6 h-6 bg-primary text-white flex items-center justify-center mt-0.5 rounded-sm">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <span className="text-sm sm:text-lg">{children}</span>
    </div>
  );
}
