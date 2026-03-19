export default function ChanceOfSuccessCard() {
  return (
    <div className="card max-w-2xl mx-auto bg-primary text-white">
      <div className="flex justify-between gap-4">
        <h3>Very high chance</h3>
        <h3>94.6%</h3>
      </div>
      <p className="text-sm sm:text-lg max-w-2/3">
        You have a very high chance of success with Wellmedr prescribed GLP-1
        medication
      </p>

      {/* Progressbar */}
      <div className="mt-4 w-full">
        <div className="flex items-center w-full h-4 gap-1">
          <div
            className="h-full bg-linear-to-b from-white to-white/50 rounded-smooth transition-all duration-500 ease-out"
            style={{ width: '94.6%' }}
          />
          <div
            className="h-full bg-[url('/assets/patterns/progress-pattern.svg')] rounded-smooth transition-all duration-500 ease-out"
            style={{ width: '5.4%' }}
          />
        </div>
      </div>
    </div>
  );
}
