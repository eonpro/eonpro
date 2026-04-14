import InfoCard from '../InfoCard';

export default function InfoCards({ goalWeight, sex }: { goalWeight: number; sex: string }) {
  return (
    <div className="relative flex w-full items-center justify-between gap-2 sm:justify-center sm:gap-4">
      <InfoCard label="Goal" value={`${goalWeight ?? 150} lbs`} />
      <InfoCard label="Metabolism" value="Fat Protein" />
      <InfoCard label="Sex" value={sex || 'Female'} valueClassName="capitalize" />
    </div>
  );
}
