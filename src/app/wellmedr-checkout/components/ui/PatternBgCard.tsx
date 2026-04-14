import cn from '@/app/wellmedr-checkout/lib/cn';
import Image from 'next/image';

export default function PatternBgCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-smooth relative flex h-[60dvh] w-full max-w-5xl items-center justify-center p-8 text-white sm:h-[65dvh]',
        className
      )}
    >
      <Image
        src="/assets/patterns/bg-pattern.webp"
        alt="Background pattern"
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 100vw, 1536px"
        className="rounded-smooth absolute inset-0 -z-10 h-full w-full object-cover"
      />

      {children}
    </div>
  );
}
