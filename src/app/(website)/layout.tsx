import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import MarketingNav from './_components/MarketingNav';
import MarketingFooter from './_components/MarketingFooter';

export const metadata: Metadata = {
  title: 'EonPro — The Operating System for Modern Telehealth Clinics',
  description:
    'EonPro vertically integrates telehealth, e-prescribing, pharmacy fulfillment, and patient engagement on one HIPAA-compliant platform. Built for multi-clinic healthcare operations at scale.',
  openGraph: {
    title: 'EonPro — The Operating System for Modern Telehealth Clinics',
    description:
      'Vertically integrated telehealth, pharmacy, and patient engagement. One platform, built for scale.',
    siteName: 'EonPro',
    type: 'website',
    url: 'https://www.eonpro.io/platform',
  },
  robots: { index: true, follow: true },
};

export default function WebsiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </>
  );
}
