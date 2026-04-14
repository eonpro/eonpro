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
    <div className="max-h-[360px]! rounded-smoother relative mx-auto h-[250px] w-full max-w-[387px] text-white sm:h-[440px] sm:max-w-2xl">
      <Image
        src="/assets/graphs/weight-progress.webp"
        alt="Weight progress chart that shows your weight loss journey"
        fill
        sizes="(max-width: 640px) 100vw, 1024px"
        className="rounded-smoother object-cover"
      />

      <div className="bg-primary absolute left-[0%] top-[11%] -translate-y-1/2 rounded-full border-2 border-[#536C7F] px-4 py-2.5 text-center backdrop-blur-sm sm:left-[6%] sm:top-[9%]">
        <p className="text-sm font-medium leading-[14px] tracking-[3%] sm:text-lg">{weight} lbs</p>
      </div>

      <div className="bg-primary absolute right-[1%] top-[39%] -translate-y-1/2 rounded-full border-2 border-[#536C7F] px-4 py-2.5 text-center backdrop-blur-sm sm:right-[5%] sm:top-[43%]">
        <p className="text-sm font-medium leading-[20px] tracking-[3%] sm:text-lg">
          {goalWeight} lbs
        </p>
        <p className="text-[0.6875rem] font-medium leading-[14px] tracking-[3%] sm:text-sm">
          Goal Weight
        </p>
      </div>

      <div className="absolute bottom-2 left-6 right-6 flex items-center justify-between text-white sm:bottom-3 sm:left-12 sm:right-12">
        <p className="text-xs font-medium sm:text-lg">Today</p>
        {halfWayWeeksText ? (
          <p className="text-xs font-medium sm:text-lg">{`${halfWayWeeksText} ${
            halfWayWeeksText === 1 ? 'Week' : 'Weeks'
          }`}</p>
        ) : null}
        <div className="justiy-center bg-primary flex items-center rounded-full px-2 py-1">
          <p className="text-xs font-medium sm:text-lg">
            {goalWeightInWeeks} {goalWeightInWeeks === 1 ? 'Week' : 'Weeks'}
          </p>
        </div>
      </div>
    </div>
  );
}
