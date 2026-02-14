/**
 * Affiliate Landing Page Layout
 *
 * Server component that provides:
 * 1. Dynamic OG metadata with the affiliate's name for social sharing
 * 2. Isolated layout (no dashboard sidebar/nav) for public landing pages
 * 3. OT Men's brand theme color and viewport settings
 */

import type { Metadata, Viewport } from 'next';
import { prisma } from '@/lib/db';

interface Props {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}

/** OT Men's brand warm cream background */
const OT_THEME_COLOR = '#F5F0EB';

/**
 * Viewport configuration for the affiliate landing pages.
 * Sets the theme-color to OT Men's warm cream for browser chrome.
 */
export const viewport: Viewport = {
  themeColor: OT_THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
};

/**
 * Generate dynamic metadata for SEO and social sharing.
 * The affiliate's name appears in the page title and OG tags,
 * making shared links personalized (e.g. "John Smith's Exclusive Offer | OT Men's Health").
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;

  // Look up the affiliate for this ref code (server-side, no fetch needed)
  let affiliateName: string | null = null;
  try {
    const refCodeRecord = await prisma.affiliateRefCode.findFirst({
      where: {
        refCode: { equals: code, mode: 'insensitive' },
        isActive: true,
        affiliate: { status: 'ACTIVE' },
      },
      select: {
        affiliate: {
          select: { displayName: true },
        },
      },
    });
    affiliateName = refCodeRecord?.affiliate.displayName || null;
  } catch {
    // Graceful fallback - generic metadata if DB query fails
  }

  const title = affiliateName
    ? `${affiliateName}'s Exclusive Offer | OT Men's Health`
    : "Men's Health Optimization | OT Men's Health";

  const description = affiliateName
    ? `${affiliateName} recommends OT Men's Health. Personalized treatments from board-certified providers — TRT, weight loss, peptide therapy, and more.`
    : "Personalized men's health treatments from board-certified providers. TRT, weight loss, peptide therapy, and more.";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: "OT Men's Health",
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function AffiliateLandingLayout({ children }: Props) {
  return (
    <div style={{ backgroundColor: OT_THEME_COLOR, minHeight: '100vh' }}>
      {children}
    </div>
  );
}
