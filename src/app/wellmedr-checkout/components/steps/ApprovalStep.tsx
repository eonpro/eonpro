import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import HeaderCountdownStripe from '../HeaderCountdownStripe';
import IntroSection from '../sections/IntroSection';
import GoalsYouWillAccomplishCard from '../GoalsYouWillAccomplishCard';
import WhatHappensNext from '../sections/WhatHappensNext';
import WhatIsIncluded from '../sections/WhatIsIncluded';
import ApprovalReservedCard from '../sections/ApprovalReservedCard';
import Products from '../sections/Products';
import CheckoutConditionalSection from '../CheckoutConditionalSection';

interface ApprovalStepProps {
  patientData: PatientData;
}

export default function ApprovalStep({ patientData }: ApprovalStepProps) {
  return (
    <>
      <HeaderCountdownStripe firstName={patientData.firstName} />

      <div className="w-full flex flex-col gap-12 sm:gap-16 sm:max-w-4xl pb-6 pt-10 sm:pt-14">
        <IntroSection patientData={patientData} />

        <GoalsYouWillAccomplishCard
          weight={patientData.weight}
          goalWeight={patientData.goalWeight}
        />
        <WhatHappensNext />
        <WhatIsIncluded />
        <ApprovalReservedCard />

        <Products />

        <CheckoutConditionalSection />
      </div>
    </>
  );
}
