import { redirect } from 'next/navigation';
import { Metadata } from 'next';

interface Props {
  params: Promise<{ code: string }>;
}

/**
 * Affiliate Landing Page - Simple Redirect
 *
 * Short URL format: /r/CODE
 * Example: https://yoursite.com/r/SARAH2024
 *
 * This page simply redirects to the main site with the ref code.
 * The tracking is handled client-side by AffiliateTracker component.
 * Invalid codes will just not be tracked (graceful degradation).
 */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;

  return {
    title: `Special Offer - ${code}`,
    description: 'Get started with your health journey today.',
    openGraph: {
      title: `Special Offer - ${code}`,
      description: 'Get started with your health journey today.',
      type: 'website',
    },
  };
}

export default async function AffiliateRedirectPage({ params }: Props) {
  const { code } = await params;

  // Simple redirect - tracking happens client-side
  // Invalid codes will fail silently at tracking time
  redirect(`/?ref=${code}`);
}
