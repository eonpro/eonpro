import cn from '@/app/wellmedr-checkout/lib/cn';
import Image from 'next/image';
import bgPattern from '/assets/patterns/bg-pattern.webp';

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
        src={bgPattern}
        alt="Background pattern"
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 100vw, 1536px"
        className="absolute inset-0 w-full h-full object-cover rounded-smooth -z-10"
        placeholder="blur"
      />

      {children}
    </div>
  );
}
