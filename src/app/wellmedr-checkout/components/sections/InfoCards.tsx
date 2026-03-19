import InfoCard from '../InfoCard';

export default function InfoCards({
  goalWeight,
  sex,
}: {
  goalWeight: number;
  sex: string;
}) {
  return (
    <div className="relative w-full flex gap-2 sm:gap-4 items-center justify-between sm:justify-center">
      <InfoCard label="Goal" value={`${goalWeight ?? 150} lbs`} />
      <InfoCard label="Metabolism" value="Fat Protein" />
      <InfoCard
        label="Sex"
        value={sex || 'Female'}
        valueClassName="capitalize"
      />
    </div>
  );
}
