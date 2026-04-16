'use client';

import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';
import SelectedProductCard from './SelectedProductCard';
import Plans from './sections/Plans';
import Addons from './sections/Addons';
import CTA from './CTA';

export default function CheckoutConditionalSection() {
  const { selectedProduct } = useCheckout();

  if (!selectedProduct) return null;

  return (
    <>
      <SelectedProductCard />
      <Plans />
      <Addons />
      <CTA id="cta" />
    </>
  );
}
