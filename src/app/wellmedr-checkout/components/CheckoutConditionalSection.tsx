'use client';

import { useCheckout } from '@/app/wellmedr-checkout/hooks/useCheckout';
import SelectedProductCard from './SelectedProductCard';
import Plans from './sections/Plans';
import Addons from './sections/Addons';
import MoneyBackGuaranteeCard from './MoneyBackGuaranteeCard';
import WhatMakesUsBetterCard from './sections/WhatMakesUsBetterCard';
import Testimonials from './sections/Testimonials';
import StartYourJourneyTodayCard from './StartYourJourneyTodayCard';
import CTA from './CTA';
import FAQ from './sections/FAQ';
import ToSText from './ToSText';

export default function CheckoutConditionalSection() {
  const { selectedProduct } = useCheckout();

  if (!selectedProduct) return null;

  return (
    <>
      <SelectedProductCard />
      <Plans />
      <Addons />
      <CTA id="cta" />
      <MoneyBackGuaranteeCard />
      <WhatMakesUsBetterCard />
      <Testimonials />
      <StartYourJourneyTodayCard />
      <CTA id="cta2" />
      <FAQ />
      <ToSText />
    </>
  );
}
