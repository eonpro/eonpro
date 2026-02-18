import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service',
};

export default function TermsOfServicePage() {
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
            <div className="rounded-xl bg-blue-100 p-3">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
          </div>

          <p className="mb-6 text-sm text-gray-500">Last updated: February 2026</p>

          <div className="prose prose-gray max-w-none">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using our telehealth platform and services, you agree to be bound
              by these Terms of Service. If you do not agree, please do not use our services.
            </p>

            <h2>2. Description of Services</h2>
            <p>
              We provide a telehealth platform that connects patients with licensed healthcare
              providers for consultations, prescriptions, and ongoing care management. Our
              services include but are not limited to online consultations, prescription
              management, medication delivery coordination, and patient health monitoring.
            </p>

            <h2>3. Eligibility</h2>
            <p>
              You must be at least 18 years of age and a resident of a state where our services
              are available. You must provide accurate, complete information when creating an
              account and during any medical consultations.
            </p>

            <h2>4. Medical Disclaimer</h2>
            <p>
              Our platform facilitates healthcare services but is not a substitute for
              in-person medical care when such care is needed. In case of a medical emergency,
              call 911 or go to the nearest emergency room. Healthcare providers on our platform
              exercise independent medical judgment.
            </p>

            <h2>5. Account Responsibilities</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials.
              You agree to notify us immediately of any unauthorized access. You must not share
              your account or use another person&apos;s account.
            </p>

            <h2>6. Payment Terms</h2>
            <p>
              Fees for services are displayed before purchase. Payments are processed securely
              through our payment provider. Refund policies are provided at the time of
              purchase and vary by service type.
            </p>

            <h2>7. Intellectual Property</h2>
            <p>
              All content, features, and functionality of our platform are owned by us and are
              protected by copyright, trademark, and other intellectual property laws.
            </p>

            <h2>8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, we shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages arising from your use of
              our services.
            </p>

            <h2>9. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account for violations of these
              terms. You may terminate your account at any time by contacting support.
            </p>

            <h2>10. Changes to Terms</h2>
            <p>
              We may update these terms from time to time. Continued use after changes
              constitutes acceptance of the modified terms.
            </p>

            <h2>11. Contact</h2>
            <p>
              Questions about these Terms? Contact us at <strong>support@eonpro.io</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
