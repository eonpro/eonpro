import CheckboxWithText from '@/app/wellmedr-checkout/components/ui/CheckboxWithText';
import Image from 'next/image';

interface GoalsYouWillAccomplishCardProps {
  weight?: number;
  goalWeight?: number;
}

export default function GoalsYouWillAccomplishCard({
  weight = 190,
  goalWeight = 90,
}: GoalsYouWillAccomplishCardProps) {
  const plannedWeightLoss = weight - goalWeight;

  return (
    <div className="card pb-6 flex flex-col sm:flex-row items-center justify-between gap-4 relative">
      <div className="w-full sm:w-1/2 flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <h3 className="text-center sm:text-left card-title mb-0">
            The goals{' '}
            <span className="italic-primary">you will accomplish</span>
            <br />
            with your plan
          </h3>
          <ul className="flex flex-col gap-3">
            <li>
              <CheckboxWithText>Lose {plannedWeightLoss} lbs</CheckboxWithText>
            </li>
            <li>
              <CheckboxWithText>
                Reset your metabolic “set point” so your body naturally wants to
                be at {goalWeight} lbs
              </CheckboxWithText>
            </li>
            <li>
              <CheckboxWithText>Look and feel healthier</CheckboxWithText>
            </li>
          </ul>
        </div>

        <p className="text-center sm:text-left">
          You will get{' '}
          <span className="font-semibold">everything you need</span>{' '}
          <span className="inline">
            <br />
          </span>{' '}
          to drop {plannedWeightLoss} lbs and keep it off.
        </p>
      </div>

      <div
        id="placeholder-div"
        className="w-[112.5px] h-[163.5px]"
        aria-hidden
      />

      <div className="w-[220px] h-[210px] sm:w-[340px] sm:h-[328px] absolute -bottom-4 sm:right-0">
        <Image
          src="/assets/images/goals-you-will-accomplish.webp"
          alt="Medical equipments"
          fill
          sizes="(max-width: 640px) 220px, 340px"
          className="object-cover object-center"
          loading="lazy"
        />
      </div>
    </div>
  );
}
