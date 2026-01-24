'use client';

import { useState } from 'react';
import {
  Mail,
  Phone,
  MessageSquare,
  FileQuestion,
  Send,
  CheckCircle,
  Book,
  Video,
  HelpCircle,
} from 'lucide-react';

const FAQ_ITEMS = [
  {
    question: 'How do I get paid?',
    answer: 'Payouts are processed automatically once your approved balance exceeds the minimum threshold ($50). You can choose to receive payments via Stripe Connect, PayPal, or bank wire. Set up your payment method in the Payouts section.',
  },
  {
    question: 'When do commissions get approved?',
    answer: 'Commissions have a hold period (typically 7-30 days) before they are approved. This allows time for any refunds or chargebacks to be processed. Once approved, commissions become available for payout.',
  },
  {
    question: 'How do I track my referrals?',
    answer: 'Use your unique referral codes and links found in the Ref Codes section. All clicks and conversions are tracked automatically. You can view your performance metrics on the Performance page.',
  },
  {
    question: 'What commission rate do I earn?',
    answer: 'Commission rates vary by program and tier. Check your dashboard to see your current commission plan. As you grow, you may qualify for higher tier rates with better commissions.',
  },
  {
    question: 'Can I create multiple referral codes?',
    answer: 'Yes! Create different codes for different campaigns or channels. This helps you track which marketing efforts are most effective. Go to the Ref Codes section to create new codes.',
  },
  {
    question: 'Why was my commission reversed?',
    answer: 'Commissions may be reversed if the referred customer requests a refund or initiates a chargeback. This is standard practice to prevent fraud and ensure program integrity.',
  },
];

export default function SupportPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    subject: '',
    category: 'general',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSubmitted(true);
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Message Sent!</h2>
          <p className="mb-6 text-gray-500">
            We'll get back to you within 24-48 hours.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setFormData({ subject: '', category: 'general', message: '' });
            }}
            className="rounded-lg bg-violet-600 px-6 py-2 font-medium text-white hover:bg-violet-700"
          >
            Send Another Message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Support</h1>
        <p className="mt-1 text-gray-500">Get help with your affiliate account</p>
      </div>

      {/* Quick Links */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Email</p>
            <p className="text-sm text-gray-500">affiliates@example.com</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-green-100 p-2 text-green-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Live Chat</p>
            <p className="text-sm text-gray-500">Mon-Fri 9am-5pm EST</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
            <Book className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Knowledge Base</p>
            <p className="text-sm text-gray-500">Guides & tutorials</p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* FAQ Section */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, index) => (
              <div key={index} className="rounded-xl bg-white shadow-sm">
                <button
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <span className="font-medium text-gray-900">{item.question}</span>
                  <HelpCircle className={`h-5 w-5 text-gray-400 transition-transform ${
                    expandedFaq === index ? 'rotate-180' : ''
                  }`} />
                </button>
                {expandedFaq === index && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-2">
                    <p className="text-sm text-gray-600">{item.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact Form */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Contact Us
          </h2>
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(f => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="general">General Question</option>
                  <option value="technical">Technical Issue</option>
                  <option value="payout">Payout Question</option>
                  <option value="commission">Commission Inquiry</option>
                  <option value="account">Account Help</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Brief description of your question"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Message
                </label>
                <textarea
                  required
                  rows={5}
                  value={formData.message}
                  onChange={(e) => setFormData(f => ({ ...f, message: e.target.value }))}
                  placeholder="Please provide details about your question or issue..."
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-3 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {submitting ? (
                  'Sending...'
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Send Message
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
