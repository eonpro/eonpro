export default function ChanceOfSuccessCard() {
  return (
    <div className="card bg-primary mx-auto max-w-2xl text-white">
      <div className="flex justify-between gap-4">
        <h3>Very high chance</h3>
        <h3>94.6%</h3>
      </div>
      <p className="max-w-2/3 text-sm sm:text-lg">
        You have a very high chance of success with Wellmedr prescribed GLP-1 medication
      </p>

      {/* Progressbar */}
      <div className="mt-4 w-full">
        <div className="flex h-4 w-full items-center gap-1">
          <div
            className="bg-linear-to-b rounded-smooth h-full from-white to-white/50 transition-all duration-500 ease-out"
            style={{ width: '94.6%' }}
          />
          <div
            className="rounded-smooth h-full bg-[url('/assets/patterns/progress-pattern.svg')] transition-all duration-500 ease-out"
            style={{ width: '5.4%' }}
          />
        </div>
      </div>
    </div>
  );
}
