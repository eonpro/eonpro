'use client';

/**
 * Affiliate Resources Page
 *
 * Marketing materials, banners, and promotional content.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Download, Image, FileText, ArrowLeft, ExternalLink } from 'lucide-react';

export default function AffiliateResourcesPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/affiliate"
            className="mb-4 inline-flex items-center gap-2 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Resources</h1>
          <p className="mt-1 text-gray-500">Marketing materials to help you succeed</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white p-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--brand-accent-light)' }}>
            <Download className="h-8 w-8" style={{ color: 'var(--brand-accent)' }} />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">Resources Coming Soon</h2>
          <p className="mx-auto max-w-sm text-gray-500">
            We&apos;re preparing marketing materials, banners, and promotional content to help you
            succeed.
          </p>

          <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <Image className="mx-auto mb-2 h-6 w-6 text-gray-400" />
              <p className="text-xs text-gray-500">Banners</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <FileText className="mx-auto mb-2 h-6 w-6 text-gray-400" />
              <p className="text-xs text-gray-500">Copy</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <ExternalLink className="mx-auto mb-2 h-6 w-6 text-gray-400" />
              <p className="text-xs text-gray-500">Guides</p>
            </div>
          </div>

          <Link
            href="/affiliate/links"
            className="mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Get Your Links
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
