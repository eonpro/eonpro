'use client';

import cn from '@/app/wellmedr-checkout/lib/cn';
import { useState } from 'react';

const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-smoothest border-border overflow-hidden border bg-white p-6 sm:p-10">
      <button
        className="flex w-full items-center justify-between gap-4 text-left sm:gap-10 lg:gap-16"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        type="button"
      >
        <h4 className="text-[1.125rem] font-medium sm:text-[1.5rem]">{question}</h4>
        <div
          className={`bg-foreground flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white transition-transform duration-500 ${
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
          'overflow-hidden transition-all duration-500 ease-in-out',
          isOpen ? 'max-h-96' : 'max-h-0'
        )}
      >
        <div className="pt-4">
          <p className="text-foreground text-sm sm:text-lg">{answer}</p>
        </div>
      </div>
    </div>
  );
};

export default FAQItem;
