import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import Products from '../sections/Products';
import CheckoutConditionalSection from '../CheckoutConditionalSection';

interface ApprovalStepProps {
  patientData: PatientData;
}

export default function ApprovalStep({ patientData }: ApprovalStepProps) {
  return (
    <div className="w-full flex flex-col items-center pb-10 pt-8 sm:pt-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2" style={{ color: '#101010' }}>
        Choose Your Treatment
      </h1>
      <p className="text-base text-center mb-8 sm:mb-12" style={{ color: '#666' }}>
        Select your medication and billing plan
      </p>

      <Products />

      <CheckoutConditionalSection />

      {/* What Happens Next */}
      <div className="w-full max-w-2xl mt-12 sm:mt-16">
        <h2 className="text-center font-bold text-lg mb-6 tracking-wide" style={{ color: '#101010' }}>WHAT HAPPENS NEXT?</h2>
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          {[
            { icon: '📋', title: 'Clinician Review', sub: 'Within 24 hours' },
            { icon: '📦', title: 'Medication Ships', sub: 'Free delivery' },
            { icon: '💬', title: 'Ongoing Support', sub: "We're here for you" },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2 sm:gap-4">
              {i > 0 && <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>}
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl mb-1">{step.icon}</div>
                <p className="text-xs sm:text-sm font-bold" style={{ color: '#101010' }}>{step.title}</p>
                <p className="text-[10px] sm:text-xs" style={{ color: '#999' }}>{step.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
