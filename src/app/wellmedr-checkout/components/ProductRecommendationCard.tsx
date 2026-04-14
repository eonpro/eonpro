import Image from 'next/image';
import Star from '@/app/wellmedr-checkout/components/icons/Star';
import { PRODUCT_NOBG_IMAGE } from '@/app/wellmedr-checkout/data/products';

export default function ProductRecommendationCard() {
  return (
    <div className="card flex flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="flex max-w-[380px] flex-col gap-2 text-center sm:text-left">
        <h3 className="card-title">Our recommendation</h3>
        <p className="text-base sm:text-lg">
          Based on your intake form, we recommend{' '}
          <span className="italic-primary">
            {' '}
            <span className="text-lg capitalize">Tirzepatide</span> injections.
          </span>{' '}
          This is the most effective and popular option of all GLP-1 medications.
        </p>
        <p className="hidden text-sm font-light sm:block sm:text-base">
          Note: you can choose whichever medication you prefer, regardless of our recommendation!
        </p>
      </div>

      <div className="relative flex items-center justify-center bg-[radial-gradient(circle,var(--color-secondary),#ffffff_40%,#ffffff_100%)] sm:shrink-0">
        <Image
          src={PRODUCT_NOBG_IMAGE}
          alt="Wellmedr Tirzepatide injections box"
          width={260}
          height={240}
          style={{ width: 'auto', height: 'auto' }}
          placeholder="blur"
        />

        <div className="rounded-smooth text-primary absolute left-[10%] top-1/2 flex items-center gap-1 bg-white px-2 py-1">
          <span className="text-xs font-semibold">Most popular</span>
          <Star />
        </div>
      </div>

      <p className="block text-center text-sm font-light sm:hidden sm:text-base">
        Note: you can choose whichever medication you prefer, regardless of our recommendation!
      </p>
    </div>
  );
}
