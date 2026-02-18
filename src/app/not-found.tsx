import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6"
      style={{ backgroundColor: '#EFECE7' }}
    >
      <div className="w-full max-w-lg text-center">
        {/* EonPro Logo */}
        <div className="mb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EONPRO_LOGO}
            alt="EONPRO"
            className="mx-auto h-8 w-auto opacity-90"
          />
        </div>

        {/* 404 Illustration */}
        <div className="mb-8">
          <div className="relative mx-auto h-36 w-48">
            {/* Background shape */}
            <div className="absolute inset-0 rounded-3xl bg-white/50" />
            {/* Large 404 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-7xl font-bold tracking-tighter text-gray-900/10">
                404
              </span>
            </div>
            {/* Foreground icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                <svg
                  className="h-8 w-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-gray-900">
          Page not found
        </h1>
        <p className="mx-auto mb-10 max-w-sm text-base leading-relaxed text-gray-500">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. It might have
          been moved or deleted.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2.5 rounded-full bg-gray-900 px-7 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-gray-800 hover:shadow-md active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2.5 rounded-full border border-gray-300/60 bg-white/80 px-7 py-3 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md active:scale-[0.98]"
          >
            Sign In
          </Link>
        </div>

        {/* Back Link */}
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Go back to previous page
        </Link>

        {/* Quick Links */}
        <div className="mt-12 rounded-2xl border border-gray-200/40 bg-white/50 p-6 backdrop-blur-sm">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-400">
            Quick Links
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link
              href="/patients"
              className="text-sm text-gray-500 transition-colors hover:text-gray-900"
            >
              Patients
            </Link>
            <Link
              href="/providers"
              className="text-sm text-gray-500 transition-colors hover:text-gray-900"
            >
              Providers
            </Link>
            <Link
              href="/provider/prescriptions"
              className="text-sm text-gray-500 transition-colors hover:text-gray-900"
            >
              Prescriptions
            </Link>
            <Link
              href="/settings"
              className="text-sm text-gray-500 transition-colors hover:text-gray-900"
            >
              Settings
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 space-y-4">
          <p className="text-sm text-gray-400">
            Need help? Contact{' '}
            <a
              href="mailto:support@eonpro.io"
              className="text-gray-500 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-700"
            >
              support@eonpro.io
            </a>
          </p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            Powered by
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={EONPRO_LOGO}
              alt="EONPRO"
              className="h-[18px] w-auto opacity-50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
