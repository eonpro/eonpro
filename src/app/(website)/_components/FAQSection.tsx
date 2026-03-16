'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    question: 'Who is EonPro built for?',
    answer:
      'EonPro is built for healthcare clinics and telehealth operations of all sizes — from single-provider practices to multi-clinic enterprises. If you prescribe medications, manage patient care remotely, or need a unified platform for telehealth + pharmacy + patient engagement, EonPro is for you.',
  },
  {
    question: 'How does white-labeling work?',
    answer:
      'Each clinic on EonPro can have its own branding — including logo, colors, favicon, and custom subdomain. Patients see your brand throughout their portal experience, while the underlying platform is powered by EonPro. Branding is configurable per-clinic from the admin settings.',
  },
  {
    question: 'What integrations are supported?',
    answer:
      'EonPro integrates with Zoom (telehealth), DoseSpot (e-prescribing), Lifefile (pharmacy fulfillment), Stripe (payments and subscriptions), Twilio (SMS and chat), AWS (storage, email, encryption), FedEx (shipment tracking), Terra (wearable devices), and more. New integrations are added regularly.',
  },
  {
    question: 'Is EonPro HIPAA compliant?',
    answer:
      'Yes. HIPAA compliance is foundational to EonPro — not an afterthought. All PHI is encrypted at rest (AES-256), access is audit-logged, data is tenant-isolated, and no PHI ever appears in application logs. All third-party services with PHI access have signed BAAs.',
  },
  {
    question: 'Can I manage multiple clinics from one account?',
    answer:
      'Absolutely. EonPro is multi-tenant by design. Super admins can manage multiple clinics, each with isolated data, unique branding, separate billing, and independent feature flag configurations. Providers can also be assigned across multiple clinics.',
  },
  {
    question: 'How do patients access the platform?',
    answer:
      'Patients access their care through a mobile-first progressive web app (PWA) that works on any device. They can track progress, message their care team, schedule visits, view medications, access lab results, and manage subscriptions — all from their browser with optional home-screen installation.',
  },
  {
    question: 'How do I get started?',
    answer:
      'Contact our team at sales@eonpro.health to schedule a demo. We\'ll walk you through the platform, discuss your clinic\'s needs, and help you get set up. Onboarding typically takes 1-2 weeks depending on your existing workflows.',
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-6 text-left transition-colors hover:text-[#4fa77e]"
      >
        <span className="text-base font-semibold text-[#1f2933] sm:text-lg">
          {question}
        </span>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-[#1f2933]/30 transition-transform duration-300 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] pb-6 opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-base leading-relaxed text-[#1f2933]/55">{answer}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQSection() {
  return (
    <section id="faq" className="bg-[#efece7] py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1f2933] sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-lg text-[#1f2933]/50">
            Everything you need to know about the platform.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200/60 bg-white px-8">
          {FAQS.map((faq) => (
            <FAQItem key={faq.question} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}
