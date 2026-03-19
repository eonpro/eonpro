export default function WhatMakesUsBetterCard() {
  return (
    <div className="card flex flex-col gap-6 max-w-xl mx-auto">
      <h3 className="card-title text-center">
        What makes Wellmedr{' '}
        <span className="italic-primary">so much better</span>{' '}
        <span className="hidden sm:inline">
          <br />
        </span>
        than anything else?
      </h3>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-8">
          <span className="block font-semibold text-5xl -tracking-[1%] leading-[56px] text-primary">
            20%
          </span>
          <p className="text-lg">Average reduction in body weight</p>
        </div>

        <div className="h-1 w-full bg-rainbow rounded-smooth" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-8">
          <span className="block font-semibold text-5xl -tracking-[1%] leading-[56px] text-primary">
            9/10
          </span>
          <p className="text-lg">
            Patients say this is the most effective weight loss treatment ever
            tried
          </p>
        </div>

        <div className="h-1 w-full bg-rainbow rounded-smooth" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-8">
          <span className="block font-semibold text-5xl -tracking-[1%] leading-[56px] text-primary">
            6.5’’
          </span>
          <p className="text-lg">Average reduction in waist size</p>
        </div>

        <div className="h-1 w-full bg-rainbow rounded-smooth" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-8">
          <span className="block font-semibold text-5xl -tracking-[1%] leading-[56px] text-primary">
            110k+
          </span>
          <p className="text-lg">Prescriptions written</p>
        </div>
      </div>
    </div>
  );
}
