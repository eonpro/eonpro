import WhatHappensNextItem from '../WhatHappensNextItem';

export default function WhatHappensNext() {
  return (
    <div className="card flex flex-col gap-6 justify-center items-center">
      <h3 className="text-center card-title">What happens next?</h3>

      <div className="flex gap-6 max-w-2xl">
        <div className="w-2 rounded-smooth bg-rainbow-to-b" />
        <ul className="max-w-2xl flex flex-col gap-8">
          <WhatHappensNextItem
            stepNo={1}
            title="Physician Review"
            description="You're already pre-qualified. After checkout, a board-certified physician will review your information and begin the approval process."
          />
          <WhatHappensNextItem
            stepNo={2}
            title="Fast Prescription Approval"
            description="Most prescriptions are approved in less than 24 hours. If needed, same-day consultations with a licensed clinician are available - at no extra charge."
          />
          <WhatHappensNextItem
            stepNo={3}
            title="Medication Shipping"
            description="Once approved, your medication is prepared and shipped. You'll receive tracking info within 2 business days, and your prescription will be on its way."
          />
          <WhatHappensNextItem
            stepNo={4}
            title="Monthly Refills"
            description="At the end of each month a provider will review your patient portal and automatically send out your refill. We will send you a text and email with tracking info as your next shipment heads your way."
          />
          <WhatHappensNextItem
            stepNo={5}
            title="Unlimited Support"
            description={
              <>
                Have questions about your progress, side effects, or dosage?
                <span className="hidden md:inline">
                  <br />
                </span>{' '}
                You'll have{' '}
                <span className="text-primary">unlimited, 24/7 access</span> to
                our care team and licensed clinicians -{' '}
                <span className="hidden md:inline">
                  <br />
                </span>{' '}
                whenever you need us.
              </>
            }
          />
        </ul>
      </div>
    </div>
  );
}
