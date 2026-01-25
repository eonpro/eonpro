'use client';

/**
 * Affiliate Terms & Conditions Page
 */

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function AffiliateTermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/affiliate/account" className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Partner Agreement</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-8"
        >
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Affiliate Partner Agreement
          </h2>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 mb-6">
              Last updated: January 2026
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              1. Program Overview
            </h3>
            <p className="text-gray-600 mb-4">
              This Affiliate Partner Agreement (&quot;Agreement&quot;) governs your participation 
              in our affiliate program. By joining the program, you agree to these terms.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              2. Commission Structure
            </h3>
            <p className="text-gray-600 mb-4">
              You will earn commissions on qualifying sales made through your unique 
              referral links. Commission rates are displayed in your dashboard and may 
              vary based on your tier level.
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Commissions are calculated on the net sale amount (excluding taxes and shipping)</li>
              <li>A 14-day hold period applies to all commissions to account for refunds</li>
              <li>Commission rates may change with 30 days notice</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              3. Payment Terms
            </h3>
            <p className="text-gray-600 mb-4">
              Payouts are processed on a monthly basis for affiliates who have reached 
              the minimum payout threshold of $50.
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Payments are made via bank transfer or PayPal</li>
              <li>W-9 form required for US affiliates earning over $600/year</li>
              <li>Payout requests are processed within 2-3 business days</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              4. Cookie Duration
            </h3>
            <p className="text-gray-600 mb-4">
              We use a 30-day cookie window for attribution. If a referred customer 
              makes a purchase within 30 days of clicking your link, you will receive 
              credit for the sale.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              5. Prohibited Activities
            </h3>
            <p className="text-gray-600 mb-4">
              The following activities are prohibited and may result in termination:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Self-referrals or using your own links for personal purchases</li>
              <li>Cookie stuffing or other fraudulent tracking methods</li>
              <li>Misleading or deceptive advertising</li>
              <li>Spam or unsolicited bulk messaging</li>
              <li>Trademark or brand name bidding in paid search</li>
              <li>Making false claims about products or services</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              6. Compliance
            </h3>
            <p className="text-gray-600 mb-4">
              You must comply with all applicable laws and regulations, including:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>FTC disclosure requirements for affiliate relationships</li>
              <li>GDPR and privacy regulations when applicable</li>
              <li>Platform-specific advertising guidelines</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              7. Termination
            </h3>
            <p className="text-gray-600 mb-4">
              Either party may terminate this agreement at any time. Upon termination:
            </p>
            <ul className="list-disc pl-6 text-gray-600 mb-4 space-y-2">
              <li>Approved commissions will be paid according to normal schedule</li>
              <li>Pending commissions may be forfeited if terms were violated</li>
              <li>You must remove all affiliate links and promotional materials</li>
            </ul>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              8. Modifications
            </h3>
            <p className="text-gray-600 mb-4">
              We reserve the right to modify these terms at any time. Material changes 
              will be communicated via email with at least 30 days notice.
            </p>

            <h3 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
              9. Contact
            </h3>
            <p className="text-gray-600 mb-4">
              For questions about this agreement or the affiliate program, please 
              contact us at{' '}
              <a href="mailto:affiliates@eonpro.com" className="text-blue-600 hover:underline">
                affiliates@eonpro.com
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
