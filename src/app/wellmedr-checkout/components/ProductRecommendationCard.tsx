import Image from 'next/image';
import Star from '@/app/wellmedr-checkout/components/icons/Star';
import { PRODUCT_NOBG_IMAGE } from '@/app/wellmedr-checkout/data/products';

export default function ProductRecommendationCard() {
  return (
    <div className="card flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex flex-col gap-2 text-center sm:text-left max-w-[380px]">
        <h3 className="card-title">Our recommendation</h3>
        <p className="text-base sm:text-lg">
          Based on your intake form, we recommend{' '}
          <span className="italic-primary">
            {' '}
            <span className="capitalize text-lg">Tirzepatide</span> injections.
          </span>{' '}
          This is the most effective and popular option of all GLP-1
          medications.
        </p>
        <p className="text-sm sm:text-base font-light hidden sm:block">
          Note: you can choose whichever medication you prefer, regardless of
          our recommendation!
        </p>
      </div>

      <div className="sm:shrink-0 flex items-center justify-center relative bg-[radial-gradient(circle,var(--color-secondary),#ffffff_40%,#ffffff_100%)]">
        <Image
          src={PRODUCT_NOBG_IMAGE}
          alt="Wellmedr Tirzepatide injections box"
          width={260}
          height={240}
          style={{ width: 'auto', height: 'auto' }}
          placeholder="blur"
        />

        <div className="absolute top-1/2 left-[10%] rounded-smooth px-2 py-1 flex items-center gap-1 bg-white text-primary">
          <span className="text-xs font-semibold">Most popular</span>
          <Star />
        </div>
      </div>

      <p className="text-sm sm:text-base font-light block sm:hidden text-center">
        Note: you can choose whichever medication you prefer, regardless of our
        recommendation!
      </p>
    </div>
  );
}
