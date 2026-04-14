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
    <div className="rounded-smooth border-primary flex flex-1 flex-col items-center justify-center gap-1 border-2 bg-white px-4 py-2 sm:gap-4 sm:px-6 sm:py-5">
      <span className="description-text text-foreground block uppercase">{label}</span>
      <span
        className={cn(
          'label block whitespace-nowrap text-base font-medium sm:text-[1.5rem]',
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
};

export default InfoCard;
