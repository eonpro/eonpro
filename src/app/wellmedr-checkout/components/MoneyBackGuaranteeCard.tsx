import Image from 'next/image';

export default function MoneyBackGuaranteeCard() {
  return (
    <div className="bg-linear-to-r from-secondary to-secondary/70 relative mx-auto max-w-2xl rounded-2xl p-6 text-white sm:p-8">
      <div className="absolute inset-0">
        <Image
          src="/assets/patterns/mesh-gradient.webp"
          alt="Mesh gradient"
          fill
          className="h-full w-full object-cover"
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          width={120}
          height={120}
          src="/assets/illustrations/money-back-guarantee.svg"
          alt="Money back guarantee"
          className="shrink-0"
          loading="lazy"
        />
        <div>
          <h3 className="mb-2 text-center text-xl font-semibold sm:text-left">
            Weight loss <span className="italic-primary font-light text-white">guarantee</span>
          </h3>
          <p className="text-center sm:text-left">
            If you do not lose weight by the end of your complete program, we give you all of your
            money back. It&apos;s that simple!
          </p>
        </div>
      </div>
    </div>
  );
}
