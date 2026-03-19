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
        'relative rounded-smooth text-white w-full p-8 h-[60dvh] sm:h-[65dvh] flex items-center justify-center max-w-5xl',
        className,
      )}
    >
      <Image
        src="/assets/patterns/bg-pattern.webp"
        alt="Background pattern"
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 100vw, 1536px"
        className="absolute inset-0 w-full h-full object-cover rounded-smooth -z-10"
      />

      {children}
    </div>
  );
}
