import Image from 'next/image';

export default function WhatIsIncluded() {
  return (
    <div>
      <h3 className="checkout-title mb-4 text-center sm:mb-8">What is included?</h3>
      <ul className="flex flex-col gap-4">
        <li className="card mx-auto flex max-w-2xl items-center justify-between gap-2 pb-0">
          <div className="flex max-w-[180px] flex-col gap-2 pb-6 sm:max-w-[360px]">
            <h3 className="text-lg sm:text-[1.5rem]">
              Prescription to fast <br />
              and effective GLP-1
            </h3>
            <p className="text-sm sm:text-lg">
              Proven medications and personalized treatments formulated just for you.
            </p>
          </div>

          <div className="relative h-[200px] w-[200px]">
            <Image
              src="/assets/images/whats-included/1.webp"
              alt="Wellmedr product with recommended badge"
              fill
              sizes="(max-width: 640px) 100vw, 200px"
              className="object-cover"
              loading="lazy"
            />
          </div>
        </li>
        <li className="card mx-auto flex max-w-2xl items-center justify-between gap-2 pb-0">
          <div className="flex max-w-[180px] flex-col gap-2 pb-6 sm:max-w-[360px]">
            <h3 className="text-lg sm:text-[1.5rem]">
              Licensed{' '}
              <span className="inline sm:hidden">
                <br />
              </span>{' '}
              provider support
            </h3>
            <p className="text-sm sm:text-lg">
              Free consultations and ongoing support from licensed providers.
            </p>
          </div>

          <div className="relative h-[200px] w-[231px]">
            <Image
              src="/assets/images/whats-included/2.webp"
              alt="Smiling clinician on FaceTime"
              fill
              sizes="(max-width: 640px) 100vw, 231px"
              className="object-cover"
              loading="lazy"
            />
          </div>
        </li>
        <li className="card mx-auto flex max-w-2xl items-center justify-between gap-2">
          <div className="flex max-w-[180px] flex-col gap-2 pb-6 sm:max-w-[360px]">
            <h3 className="text-lg sm:text-[1.5rem]">
              Care that{' '}
              <span className="hidden sm:inline">
                perfectly <br />
              </span>{' '}
              fits{' '}
              <span className="inline sm:hidden">
                <br />
              </span>{' '}
              your schedule
            </h3>
            <p className="text-sm sm:text-lg">Manage treatment and get ongoing support online.</p>
          </div>

          <div className="relative h-[183.5px] w-[198.5px]">
            <Image
              src="/assets/images/whats-included/3.webp"
              alt="Online interface of Wellmedr app"
              fill
              sizes="(max-width: 640px) 100vw, 198.5px"
              className="object-cover"
              loading="lazy"
            />
          </div>
        </li>
      </ul>
    </div>
  );
}
