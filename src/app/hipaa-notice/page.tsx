import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'HIPAA Notice of Privacy Practices',
};

export default function HipaaNoticePage() {
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
            <div className="rounded-xl bg-violet-100 p-3">
              <Lock className="h-6 w-6 text-violet-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">
              HIPAA Notice of Privacy Practices
            </h1>
          </div>

          <p className="mb-6 text-sm text-gray-500">Effective: February 2026</p>

          <div className="prose prose-gray max-w-none">
            <div className="mb-6 rounded-lg border border-violet-200 bg-violet-50 p-4">
              <p className="text-sm text-violet-800">
                <strong>THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED
                AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW
                IT CAREFULLY.</strong>
              </p>
            </div>

            <h2>Our Commitment to Your Privacy</h2>
            <p>
              We are required by law to maintain the privacy of your Protected Health
              Information (PHI), provide you with this notice of our legal duties and privacy
              practices, and follow the terms of this notice currently in effect.
            </p>

            <h2>How We May Use and Disclose Your PHI</h2>
            <h3>For Treatment</h3>
            <p>
              We may use and share your health information to provide, coordinate, or manage
              your healthcare and related services. This includes consultation between healthcare
              providers relating to your care and referrals for treatment.
            </p>

            <h3>For Payment</h3>
            <p>
              We may use and share your health information to bill and receive payment for
              treatment and services provided to you. This may include sharing information
              with billing companies, insurance companies, or other third parties responsible
              for payment.
            </p>

            <h3>For Healthcare Operations</h3>
            <p>
              We may use and share your health information for our healthcare operations,
              including quality improvement, staff training, compliance programs, and audit
              activities.
            </p>

            <h3>As Required by Law</h3>
            <p>
              We may disclose your PHI when required to do so by federal, state, or local law,
              including public health activities, health oversight, judicial proceedings, and
              law enforcement purposes.
            </p>

            <h2>Your Rights Regarding Your PHI</h2>
            <ul>
              <li>
                <strong>Right to Access:</strong> You have the right to inspect and obtain a
                copy of your PHI maintained by us.
              </li>
              <li>
                <strong>Right to Amend:</strong> You may request amendments to your PHI if
                you believe information is incorrect or incomplete.
              </li>
              <li>
                <strong>Right to Accounting:</strong> You may request an accounting of
                disclosures of your PHI made by us.
              </li>
              <li>
                <strong>Right to Restrict:</strong> You may request restrictions on how we
                use or disclose your PHI for treatment, payment, or healthcare operations.
              </li>
              <li>
                <strong>Right to Confidential Communications:</strong> You may request that
                we communicate with you about your health information in a particular way or
                at a specific location.
              </li>
              <li>
                <strong>Right to a Copy of This Notice:</strong> You may request a paper copy
                of this notice at any time.
              </li>
            </ul>

            <h2>Our Responsibilities</h2>
            <ul>
              <li>Maintain the privacy of your PHI as required by law</li>
              <li>Provide you with this notice of our privacy practices</li>
              <li>Notify you if a breach occurs that may have compromised your PHI</li>
              <li>Follow the terms of this notice currently in effect</li>
              <li>Not use or share your information other than as described here without your written permission</li>
            </ul>

            <h2>Complaints</h2>
            <p>
              If you believe your privacy rights have been violated, you may file a complaint
              with us at <strong>support@eonpro.io</strong> or with the U.S. Department of
              Health and Human Services Office for Civil Rights. We will not retaliate against
              you for filing a complaint.
            </p>

            <h2>Contact Information</h2>
            <p>
              For questions about this notice or to exercise your rights, contact our Privacy
              Officer at <strong>support@eonpro.io</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
