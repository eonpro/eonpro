import cn from '@/app/wellmedr-checkout/lib/cn';
import Link from 'next/link';
import Star from '../icons/Star';
import Logo from '../icons/Logo';
import { Fragment } from 'react/jsx-runtime';

const Header = ({ className }: { className?: string }) => {
  return (
    <header
      className={cn(
        'w-full flex justify-between items-center pt-6 max-w-4xl mx-auto px-6 sm:px-8 gap-4',
        className,
      )}
    >
      <Link href="/" className="w-full max-w-[272px] h-[26px]">
        <Logo className="w-full h-full" aria-label="Wellmedr Logo" />
      </Link>

      <div className="flex items-center gap-2 bg-white rounded-[40px] pl-4 pr-2 py-2 border border-[rgba(54,28,12,0.08)]">
        <span className="sm:hidden text-[1.125rem] font-medium text-foreground leading-[148%] mt-0.5 tracking-[0%]">
          4.8
        </span>
        <span className="hidden sm:inline text-lg font-medium text-foreground leading-[148%] tracking-[0%]">
          Excellent 4.8
        </span>
        <span className="hidden sm:inline text-foreground opacity-80">|</span>
        <Star className="w-5 h-5 sm:hidden text-secondary" />

        <div className="hidden sm:flex sm:items-center">
          {Array.from({ length: 5 }).map((_, i) => (
            <Fragment key={`hs__${i}`}>
              <Star className="h-5 w-5 text-secondary" />
            </Fragment>
          ))}
        </div>
      </div>
    </header>
  );
};

export default Header;
