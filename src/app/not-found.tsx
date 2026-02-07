import Link from 'next/link';
import { Home, ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#efece7' }}>
      <div className="max-w-md w-full text-center">
        {/* 404 Illustration */}
        <div className="mb-8">
          <div className="relative mx-auto w-40 h-40">
            {/* Animated circles */}
            <div className="absolute inset-0 bg-emerald-100 rounded-full animate-pulse" />
            <div className="absolute inset-4 bg-emerald-200 rounded-full animate-pulse delay-75" />
            <div className="absolute inset-8 bg-emerald-300 rounded-full animate-pulse delay-150" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold text-emerald-700">404</span>
            </div>
          </div>
        </div>

        {/* Message */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Page not found
        </h1>
        <p className="text-gray-600 mb-8">
          Sorry, we couldn't find the page you're looking for. It might have been moved, deleted, or you may have mistyped the URL.
        </p>

        {/* Search Box */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for what you need..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <Home className="w-5 h-5" />
            Home
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
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
        <div className="mt-12 pt-6 border-t border-gray-200">
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
