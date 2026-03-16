import HeroSection from '../_components/HeroSection';
import PlatformOverview from '../_components/PlatformOverview';
import ProductShowcase from '../_components/ProductShowcase';
import CapabilitiesGrid from '../_components/CapabilitiesGrid';
import TrustSection from '../_components/TrustSection';
import FAQSection from '../_components/FAQSection';
import FooterCTA from '../_components/FooterCTA';

export default function PlatformPage() {
  return (
    <>
      <HeroSection />
      <PlatformOverview />
      <ProductShowcase />
      <CapabilitiesGrid />
      <TrustSection />
      <FAQSection />
      <FooterCTA />
    </>
  );
}
