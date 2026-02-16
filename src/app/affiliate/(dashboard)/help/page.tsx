'use client';

/**
 * Affiliate Help Page
 *
 * FAQs and support information.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import { HelpCircle, MessageCircle, Mail, ArrowLeft, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useBranding } from '../branding-context';

const faqs = [
  {
    question: 'How do I get paid?',
    answer:
      'Earnings are paid out monthly via direct deposit or PayPal once you reach the minimum threshold of $50. You can set up your payout preferences in the Account section.',
  },
  {
    question: 'How long is the cookie duration?',
    answer:
      "We use a 30-day cookie window. This means if someone clicks your link and makes a purchase within 30 days, you'll earn the commission.",
  },
  {
    question: 'What is my commission rate?',
    answer:
      'Commission rates vary by tier and product type. You can see your current rate on the dashboard. As you generate more sales, you may qualify for higher tiers with better rates.',
  },
  {
    question: 'Can I promote on social media?',
    answer:
      'Yes! You can promote your affiliate link on social media, your website, email newsletters, and other platforms. Just make sure to follow FTC disclosure guidelines.',
  },
  {
    question: 'How do I track my conversions?',
    answer:
      'All conversions are tracked automatically when someone uses your unique referral link. You can view your clicks, conversions, and earnings in real-time on your dashboard.',
  },
];

export default function AffiliateHelpPage() {
  const branding = useBranding();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const supportEmail = branding.supportEmail || 'affiliates@eonpro.com';

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
          <h1 className="text-2xl font-semibold text-gray-900">Help & Support</h1>
          <p className="mt-1 text-gray-500">FAQs and ways to get in touch</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {/* FAQs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-2xl bg-white"
        >
          <div className="border-b border-gray-100 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <HelpCircle className="h-5 w-5 text-gray-500" />
              Frequently Asked Questions
            </h2>
          </div>

          <div className="divide-y divide-gray-100">
            {faqs.map((faq, index) => (
              <div key={index}>
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">{faq.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 text-gray-400 transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-6 pb-4"
                  >
                    <p className="text-gray-600">{faq.answer}</p>
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Contact Support */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white p-6"
        >
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Need More Help?</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <a
              href={`mailto:${supportEmail}`}
              className="flex items-center gap-4 rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--brand-accent-light)' }}>
                <Mail className="h-5 w-5" style={{ color: 'var(--brand-accent)' }} />
              </div>
              <div>
                <p className="font-medium text-gray-900">Email Support</p>
                <p className="text-sm text-gray-500">{supportEmail}</p>
              </div>
            </a>

            <a
              href="#"
              className="flex items-center gap-4 rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
                <MessageCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Live Chat</p>
                <p className="text-sm text-gray-500">Available 9am-5pm EST</p>
              </div>
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
