'use client';

import cn from '@/app/wellmedr-checkout/lib/cn';
import { AddonId } from '@/app/wellmedr-checkout/types/checkout';
import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';
import {
  ADDON_PRODUCTS,
  INDIVIDUAL_ADDON_IDS,
  BUNDLE_ADDON_ID,
  BUNDLE_SAVINGS,
} from '@/app/wellmedr-checkout/data/addons';

function AddonCard({
  addonId,
  selected,
  onToggle,
}: {
  addonId: AddonId;
  selected: boolean;
  onToggle: () => void;
}) {
  const addon = ADDON_PRODUCTS[addonId];

  return (
    <div
      onClick={onToggle}
      className={cn(
        'relative cursor-pointer border rounded-2xl p-5 sm:p-6 bg-white w-full transition-all duration-300 hover:border-primary hover:shadow-md',
        selected ? 'border-primary shadow-md' : 'border-border',
      )}
    >
      {/* Checkbox indicator */}
      <div className="absolute top-4 right-4">
        <div
          className={cn(
            'w-6 h-6 rounded border-2 flex items-center justify-center transition-all',
            selected ? 'bg-primary border-primary' : 'border-border',
          )}
        >
          {selected && (
            <svg
              className="w-4 h-4 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 pr-8">
        <p className="font-medium text-foreground text-lg">{addon.name}</p>
        <p className="text-foreground/60 text-sm">{addon.description}</p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-foreground font-semibold text-xl">
          ${addon.monthlyPrice}
          <span className="text-foreground/50 text-sm font-normal">/mo</span>
        </span>
      </div>
    </div>
  );
}

function BundleCard({
  selected,
  onToggle,
}: {
  selected: boolean;
  onToggle: () => void;
}) {
  const bundle = ADDON_PRODUCTS[BUNDLE_ADDON_ID];

  return (
    <div
      onClick={onToggle}
      className={cn(
        'relative cursor-pointer border-2 rounded-2xl p-5 sm:p-6 bg-white w-full transition-all duration-300 hover:border-primary hover:shadow-md',
        selected
          ? 'border-primary shadow-md bg-primary/[0.02]'
          : 'border-border',
      )}
    >
      {/* Best value badge */}
      <div className="absolute -top-3 left-4">
        <span className="bg-primary text-white text-xs font-semibold px-3 py-1 rounded-full">
          Best Value — Save ${BUNDLE_SAVINGS}
        </span>
      </div>

      {/* Checkbox indicator */}
      <div className="absolute top-4 right-4">
        <div
          className={cn(
            'w-6 h-6 rounded border-2 flex items-center justify-center transition-all',
            selected ? 'bg-primary border-primary' : 'border-border',
          )}
        >
          {selected && (
            <svg
              className="w-4 h-4 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 pr-8 mt-2">
        <p className="font-medium text-foreground text-lg">{bundle.name}</p>
        <p className="text-foreground/60 text-sm">{bundle.description}</p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-foreground font-semibold text-xl">
          ${bundle.monthlyPrice}
          <span className="text-foreground/50 text-sm font-normal">/mo</span>
        </span>
        <span className="text-foreground/40 line-through text-sm">
          $
          {INDIVIDUAL_ADDON_IDS.reduce(
            (sum, id) => sum + ADDON_PRODUCTS[id].monthlyPrice,
            0,
          )}
          /mo
        </span>
      </div>
    </div>
  );
}

export default function Addons() {
  const { selectedAddons, handleAddonToggle, selectedProduct } = useCheckout();

  if (!selectedProduct) return null;

  const isAddonSelected = (id: AddonId) => {
    if (selectedAddons.includes(id)) return true;
    if (
      selectedAddons.includes('elite_bundle') &&
      ADDON_PRODUCTS.elite_bundle.bundledAddonIds?.includes(id)
    ) {
      return true;
    }
    return false;
  };

  return (
    <section className="flex flex-col gap-6 sm:gap-8 w-full">
      <div className="text-center">
        <h3>Boost your results</h3>
        <p className="text-foreground/70">
          Add premium treatments to your plan
        </p>
      </div>

      {/* Bundle card first */}
      <BundleCard
        selected={selectedAddons.includes('elite_bundle')}
        onToggle={() => handleAddonToggle('elite_bundle')}
      />

      {/* Individual addons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {INDIVIDUAL_ADDON_IDS.map((addonId) => (
          <AddonCard
            key={addonId}
            addonId={addonId}
            selected={isAddonSelected(addonId)}
            onToggle={() => handleAddonToggle(addonId)}
          />
        ))}
      </div>
    </section>
  );
}
