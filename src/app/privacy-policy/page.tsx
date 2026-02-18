import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="rounded-2xl bg-white p-8 shadow-sm sm:p-12">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-xl bg-emerald-100 p-3">
              <Shield className="h-6 w-6 text-emerald-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          </div>

          <p className="mb-6 text-sm text-gray-500">Last updated: February 2026</p>

          <div className="prose prose-gray max-w-none">
            <h2>1. Information We Collect</h2>
            <p>
              We collect information you provide directly, including personal information such as
              your name, email address, phone number, and health-related information necessary to
              provide our telehealth services. We also collect information automatically through
              cookies and similar technologies when you use our platform.
            </p>

            <h2>2. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li>Provide and improve our healthcare services</li>
              <li>Process prescriptions and manage your treatment plan</li>
              <li>Communicate with you about your care</li>
              <li>Process payments and manage billing</li>
              <li>Comply with legal and regulatory obligations</li>
              <li>Ensure platform security and prevent fraud</li>
            </ul>

            <h2>3. HIPAA Compliance</h2>
            <p>
              We are committed to protecting your Protected Health Information (PHI) in accordance
              with the Health Insurance Portability and Accountability Act (HIPAA). Your health
              information is encrypted at rest and in transit. Access to PHI is restricted to
              authorized healthcare providers and staff on a need-to-know basis.
            </p>

            <h2>4. Information Sharing</h2>
            <p>
              We do not sell your personal information. We may share your information with:
            </p>
            <ul>
              <li>Healthcare providers involved in your care</li>
              <li>Pharmacies for prescription fulfillment</li>
              <li>Payment processors for billing</li>
              <li>Service providers who assist in platform operations (under BAAs)</li>
              <li>As required by law or legal process</li>
            </ul>

            <h2>5. Data Security</h2>
            <p>
              We implement industry-standard security measures including encryption, access
              controls, audit logging, and regular security assessments to protect your data.
              All third-party service providers that handle PHI are required to sign Business
              Associate Agreements (BAAs).
            </p>

            <h2>6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal and health information</li>
              <li>Request corrections to your records</li>
              <li>Request deletion of your data (subject to legal retention requirements)</li>
              <li>Receive a copy of your data in a portable format</li>
              <li>Opt out of non-essential communications</li>
            </ul>

            <h2>7. Data Retention</h2>
            <p>
              We retain your health records in accordance with applicable state and federal
              regulations. Non-medical data is retained for as long as necessary to provide
              our services or as required by law.
            </p>

            <h2>8. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or wish to exercise your rights,
              please contact us at <strong>support@eonpro.io</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
