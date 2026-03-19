import cn from '@/app/wellmedr-checkout/lib/cn';

export interface ButtonStyleProps {
  variant?: 'default' | 'outline';
  disabled?: boolean;
  className?: string;
}

export const getButtonStyles = ({
  variant = 'default',
  disabled,
  className,
}: ButtonStyleProps) => {
  return cn(
    'w-full py-4 rounded-full text-white font-medium text-base transition-all duration-300 flex items-center justify-center gap-4 cursor-pointer label',

    // Default variant
    variant === 'default' && [
      'bg-primary',
      !disabled && 'hover:bg-primary-dark',
    ],

    // Outline variant
    variant === 'outline' && [
      'border-1 text-foreground border-[1.5px] border-border bg-white',
      !disabled && 'hover:border-primary',
    ],

    // Disabled state overrides
    disabled && 'opacity-50 cursor-not-allowed',

    className,
  );
};
