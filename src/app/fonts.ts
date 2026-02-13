import localFont from 'next/font/local';

// Sofia Pro font configuration
// Make sure to add your Sofia Pro font files to the public/fonts directory
export const sofiaPro = localFont({
  src: [
    {
      path: '../../public/fonts/SofiaPro-Light.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../public/fonts/SofiaPro-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/SofiaPro-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/SofiaPro-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../../public/fonts/SofiaPro-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../public/fonts/SofiaPro-Black.woff2',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-sofia-pro',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Arial', 'sans-serif'],
});
