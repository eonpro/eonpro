import Image from 'next/image';

export default function MoneyBackGuaranteeCard() {
  return (
    <div className="relative bg-linear-to-r from-secondary text-white to-secondary/70 rounded-2xl p-6 sm:p-8 max-w-2xl mx-auto">
      <div className="absolute inset-0">
        <Image
          src="/assets/patterns/mesh-gradient.webp"
          alt="Mesh gradient"
          fill
          className="w-full h-full object-cover"
        />
      </div>

      <div className="relative z-10 flex flex-col sm:flex-row gap-6 sm:gap-10 items-center">
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
          <h3 className="text-xl font-semibold text-center sm:text-left mb-2">
            Weight loss{' '}
            <span className="italic-primary text-white font-light">
              guarantee
            </span>
          </h3>
          <p className="text-center sm:text-left">
            If you do not lose weight by the end of your complete program, we
            give you all of your money back. It&apos;s that simple!
          </p>
        </div>
      </div>
    </div>
  );
}
