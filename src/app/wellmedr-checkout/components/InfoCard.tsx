import cn from '@/app/wellmedr-checkout/lib/cn';

const InfoCard = ({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) => {
  return (
    <div className="flex-1 rounded-smooth py-2 sm:py-5 px-4 sm:px-6 bg-white flex flex-col gap-1 sm:gap-4 items-center justify-center border-2 border-primary">
      <span className="description-text uppercase block text-foreground">
        {label}
      </span>
      <span
        className={cn(
          'label font-medium text-base sm:text-[1.5rem] block whitespace-nowrap',
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
};

export default InfoCard;
