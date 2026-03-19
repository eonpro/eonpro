import Image from 'next/image';
import image1 from '/assets/images/whats-included/1.webp';
import image2 from '/assets/images/whats-included/2.webp';
import image3 from '/assets/images/whats-included/3.webp';

export default function WhatIsIncluded() {
  return (
    <div>
      <h3 className="text-center checkout-title mb-4 sm:mb-8">
        What is included?
      </h3>
      <ul className="flex flex-col gap-4">
        <li className="card pb-0 max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex flex-col pb-6 gap-2 max-w-[180px] sm:max-w-[360px]">
            <h3 className="text-lg sm:text-[1.5rem]">
              Prescription to fast <br />
              and effective GLP-1
            </h3>
            <p className="text-sm sm:text-lg">
              Proven medications and personalized treatments formulated just for
              you.
            </p>
          </div>

          <div className="relative w-[200px] h-[200px]">
            <Image
              src={image1}
              alt="Wellmedr product with recommended badge and 100% trusted Certificate of Analysis badge"
              fill
              sizes="(max-width: 640px) 100vw, 200px"
              className="object-cover"
              placeholder="blur"
              loading="lazy"
            />
          </div>
        </li>
        <li className="card pb-0 max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex flex-col pb-6 gap-2 max-w-[180px] sm:max-w-[360px]">
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

          <div className="relative w-[231px] h-[200px]">
            <Image
              src={image2}
              alt="Smiling clinician on the FaceTime"
              fill
              sizes="(max-width: 640px) 100vw, 231px"
              className="object-cover"
              placeholder="blur"
              loading="lazy"
            />
          </div>
        </li>
        <li className="card max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex flex-col pb-6 gap-2 max-w-[180px] sm:max-w-[360px]">
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
            <p className="text-sm sm:text-lg">
              Manage treatment and get ongoing support online.
            </p>
          </div>

          <div className="relative w-[198.5px] h-[183.5px]">
            <Image
              src={image3}
              alt="Online interface of Wellmedr app"
              fill
              sizes="(max-width: 640px) 100vw, 198.5px"
              className="object-cover"
              placeholder="blur"
              loading="lazy"
            />
          </div>
        </li>
      </ul>
    </div>
  );
}
