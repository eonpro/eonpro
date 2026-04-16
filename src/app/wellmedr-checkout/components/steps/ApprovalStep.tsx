import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import Products from '../sections/Products';
import CheckoutConditionalSection from '../CheckoutConditionalSection';

interface ApprovalStepProps {
  patientData: PatientData;
}

export default function ApprovalStep({ patientData }: ApprovalStepProps) {
  return (
    <div className="flex w-full flex-col items-center pb-10 pt-8 sm:pt-10">
      <h1 className="mb-2 text-center text-2xl font-bold sm:text-3xl" style={{ color: '#101010' }}>
        Choose Your Treatment
      </h1>
      <p className="mb-8 text-center text-base sm:mb-12" style={{ color: '#666' }}>
        Select your medication and billing plan
      </p>

      <Products />

      <CheckoutConditionalSection />

      {/* What Happens Next */}
      <div className="mt-12 w-full max-w-2xl sm:mt-16">
        <h2
          className="mb-6 text-center text-lg font-bold tracking-wide"
          style={{ color: '#101010' }}
        >
          WHAT HAPPENS NEXT?
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
          {[
            { icon: '📋', title: 'Clinician Review', sub: 'Within 24 hours' },
            { icon: '📦', title: 'Medication Ships', sub: 'Free delivery' },
            { icon: '💬', title: 'Ongoing Support', sub: "We're here for you" },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2 sm:gap-4">
              {i > 0 && (
                <svg
                  className="h-4 w-4 shrink-0 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
              <div className="flex flex-col items-center text-center">
                <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-xl">
                  {step.icon}
                </div>
                <p className="text-xs font-bold sm:text-sm" style={{ color: '#101010' }}>
                  {step.title}
                </p>
                <p className="text-xs" style={{ color: '#767676' }}>
                  {step.sub}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
