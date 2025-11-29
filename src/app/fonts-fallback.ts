import { Outfit } from 'next/font/google'

// Fallback font - Outfit from Google Fonts
// This is similar to Sofia Pro and can be used as a temporary replacement
// Once you have Sofia Pro files, you can switch to the local font configuration
export const outfitFont = Outfit({
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'sans-serif'],
})

// Instructions for switching to Sofia Pro:
// 1. Add your Sofia Pro font files to public/fonts/
// 2. In layout.tsx, import from './fonts' instead of './fonts-fallback'
// 3. Replace outfitFont with sofiaPro in the layout
