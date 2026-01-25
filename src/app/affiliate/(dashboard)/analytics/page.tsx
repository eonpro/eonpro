'use client';

/**
 * Affiliate Analytics Page
 * 
 * Detailed performance metrics and reporting.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Calendar, ArrowLeft } from 'lucide-react';

export default function AffiliateAnalyticsPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100">
        <div className="max-w-3xl mx-auto">
          <Link 
            href="/affiliate" 
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-gray-500 mt-1">Track your performance over time</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Analytics Coming Soon
          </h2>
          <p className="text-gray-500 max-w-sm mx-auto">
            Detailed charts and reporting features are being built. 
            Check back soon for performance trends, conversion analytics, and more.
          </p>
          
          <div className="mt-8 grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="p-4 bg-gray-50 rounded-xl">
              <TrendingUp className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Trends</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <BarChart3 className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Charts</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <Calendar className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Reports</p>
            </div>
          </div>
          
          <Link
            href="/affiliate/earnings"
            className="inline-flex items-center gap-2 mt-8 px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            View Earnings Instead
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
