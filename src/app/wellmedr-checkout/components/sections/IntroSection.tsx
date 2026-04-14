import { PatientData } from '@/app/wellmedr-checkout/types/fillout';
import InfoCards from './InfoCards';
import WeightProgressChart from '../WeightProgressChart';
import ProductRecommendationCard from '../ProductRecommendationCard';
import ChanceOfSuccessCard from '../ChanceOfSuccessCard';
import ApprovalIntroParagraphs from './ApprovalIntroParagraphs';

export default function IntroSection({ patientData }: { patientData: PatientData }) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <h2 className="checkout-title text-center">
        {patientData.firstName || 'Amanda'}'s GLP-1{' '}
        <span className="inline sm:hidden">
          <br />
        </span>
        prescription <span className="italic-primary">plan approval!</span>
      </h2>
      <InfoCards goalWeight={patientData.goalWeight} sex={patientData.sex} />
      <ApprovalIntroParagraphs />
      <WeightProgressChart weight={patientData.weight} goalWeight={patientData.goalWeight} />
      <ProductRecommendationCard />
      <ChanceOfSuccessCard />
    </div>
  );
}
