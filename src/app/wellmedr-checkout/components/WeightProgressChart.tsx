import calculateGoalWeightInWeeks from '@/app/wellmedr-checkout/lib/calculateGoalWeightInWeeks';
import Image from 'next/image';

interface WeightProgressChartProps {
  weight?: number;
  goalWeight?: number;
}

export default function WeightProgressChart({
  weight = 190,
  goalWeight = 90,
}: WeightProgressChartProps) {
  const goalWeightInWeeks = calculateGoalWeightInWeeks(weight, goalWeight);
  const halfWayWeeksText = Math.floor(goalWeightInWeeks / 2);

  return (
    <div className="relative w-full max-w-[387px] max-h-[360px]! sm:max-w-2xl mx-auto h-[250px] sm:h-[440px] rounded-smoother text-white">
      <Image
        src="/assets/graphs/weight-progress.webp"
        alt="Weight progress chart that shows your weight loss journey"
        fill
        sizes="(max-width: 640px) 100vw, 1024px"
        className="object-cover rounded-smoother"
      />

      <div className="backdrop-blur-sm absolute -translate-y-1/2 rounded-full border-2 text-center py-2.5 px-4 left-[0%] sm:left-[6%] top-[11%] sm:top-[9%] bg-primary border-[#536C7F]">
        <p className="font-medium text-sm sm:text-lg tracking-[3%] leading-[14px]">
          {weight} lbs
        </p>
      </div>

      <div className="backdrop-blur-sm absolute -translate-y-1/2 rounded-full border-2 text-center py-2.5 px-4 right-[1%] sm:right-[5%] top-[39%] sm:top-[43%] bg-primary border-[#536C7F]">
        <p className="font-medium text-sm sm:text-lg tracking-[3%] leading-[20px]">
          {goalWeight} lbs
        </p>
        <p className="font-medium text-[0.6875rem] sm:text-sm tracking-[3%] leading-[14px]">
          Goal Weight
        </p>
      </div>

      <div className="flex justify-between items-center left-6 right-6 sm:left-12 sm:right-12 bottom-2 sm:bottom-3 absolute text-white">
        <p className="font-medium text-xs sm:text-lg ">Today</p>
        {halfWayWeeksText ? (
          <p className="font-medium text-xs sm:text-lg ">{`${halfWayWeeksText} ${
            halfWayWeeksText === 1 ? 'Week' : 'Weeks'
          }`}</p>
        ) : null}
        <div className="flex items-center justiy-center px-2 py-1 bg-primary rounded-full">
          <p className="font-medium text-xs sm:text-lg ">
            {goalWeightInWeeks} {goalWeightInWeeks === 1 ? 'Week' : 'Weeks'}
          </p>
        </div>
      </div>
    </div>
  );
}
