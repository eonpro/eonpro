'use client';

import cn from '@/app/wellmedr-checkout/lib/cn';
import { useState } from 'react';

const FAQItem = ({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-smoothest border border-border overflow-hidden p-6 sm:p-10">
      <button
        className="w-full flex justify-between items-center gap-10 sm:gap-40 lg:gap-56 text-left"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        type="button"
      >
        <h4 className="text-[1.125rem] sm:text-[1.5rem] font-medium">
          {question}
        </h4>
        <div
          className={`transition-transform duration-500 text-white bg-foreground rounded-full p-1 ${
            isOpen ? 'rotate-45' : 'rotate-0'
          }`}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 5V19M5 12H19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>
      <div
        className={cn(
          'transition-all duration-500 ease-in-out overflow-hidden',
          isOpen ? 'max-h-96' : 'max-h-0',
        )}
      >
        <div className="pt-4">
          <p className="text-sm sm:text-lg text-foreground">{answer}</p>
        </div>
      </div>
    </div>
  );
};

export default FAQItem;
