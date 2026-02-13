import Link from 'next/link';
import { Home, ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ backgroundColor: '#efece7' }}
    >
      <div className="w-full max-w-md text-center">
        {/* 404 Illustration */}
        <div className="mb-8">
          <div className="relative mx-auto h-40 w-40">
            {/* Animated circles */}
            <div className="absolute inset-0 animate-pulse rounded-full bg-emerald-100" />
            <div className="absolute inset-4 animate-pulse rounded-full bg-emerald-200 delay-75" />
            <div className="absolute inset-8 animate-pulse rounded-full bg-emerald-300 delay-150" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold text-emerald-700">404</span>
            </div>
          </div>
        </div>

        {/* Message */}
        <h1 className="mb-4 text-3xl font-bold text-gray-900">Page not found</h1>
        <p className="mb-8 text-gray-600">
          Sorry, we couldn't find the page you're looking for. It might have been moved, deleted, or
          you may have mistyped the URL.
        </p>

        {/* Search Box */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search for what you need..."
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Quick Links */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <Home className="h-5 w-5" />
            Home
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Login
          </Link>
        </div>

        {/* Helpful Links */}
        <div className="text-sm text-gray-500">
          <p className="mb-3 font-medium text-gray-700">Popular destinations:</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link href="/patients" className="text-emerald-600 hover:underline">
              Patients
            </Link>
            <Link href="/providers" className="text-emerald-600 hover:underline">
              Providers
            </Link>
            <Link href="/prescriptions" className="text-emerald-600 hover:underline">
              Prescriptions
            </Link>
            <Link href="/settings" className="text-emerald-600 hover:underline">
              Settings
            </Link>
          </div>
        </div>

        {/* Support Info */}
        <div className="mt-12 border-t border-gray-200 pt-6">
          <p className="text-sm text-gray-500">
            Need help? Contact{' '}
            <a href="mailto:support@eonpro.io" className="text-emerald-600 hover:underline">
              support@eonpro.io
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
