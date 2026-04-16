import { TestimonialType } from '@/app/wellmedr-checkout/data/testimonials';
import Image from 'next/image';
import Verified from '@/app/wellmedr-checkout/components/icons/Verified';
import ShortArrowRightFill from '@/app/wellmedr-checkout/components/icons/ShortArrowRightFill';

const TestimonialCard = ({ testimonial }: { testimonial: TestimonialType }) => {
  const {
    title,
    testimonial: testimonialText,
    personName,
    personAge,
    startWeight,
    endWeight,
    progressInMonths,
    beforeImg,
    afterImg,
  } = testimonial;

  return (
    <div className="card flex flex-1 flex-col justify-between gap-8 p-6 drop-shadow-md">
      <div className="flex flex-col gap-8">
        <div className="flex gap-2">
          <div className="rounded-smooth relative min-h-[180px] w-full flex-1 sm:min-h-[246px]">
            <Image
              src={beforeImg}
              alt="Testimonial"
              fill
              placeholder="blur"
              sizes="(max-width: 640px) 50vw, 300px"
              className="rounded-smooth flex-1 object-cover object-center"
              loading="lazy"
            />

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-2">
              <p className="inline-flex min-w-fit whitespace-nowrap rounded-full border border-white/40 bg-black/20 px-3 py-2.5 text-sm text-white backdrop-blur-sm">
                Month 0
              </p>
            </div>
          </div>

          <div className="rounded-smooth relative min-h-[180px] w-full flex-1 sm:min-h-[246px]">
            <Image
              src={afterImg}
              alt="Testimonial"
              fill
              placeholder="blur"
              sizes="(max-width: 640px) 50vw, 300px"
              className="rounded-smooth flex-1 object-cover object-center"
              loading="lazy"
            />

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-2">
              <p className="inline-flex min-w-fit whitespace-nowrap rounded-full border border-white/40 bg-black/20 px-3 py-2.5 text-sm text-white backdrop-blur-sm">
                Month {progressInMonths}
              </p>
            </div>
          </div>
        </div>
        <div>
          <h4 className="title mb-2 text-[1.5rem]">{title}</h4>
          <p className="text-sm opacity-80 sm:text-base">{testimonialText}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Person Name */}
        <div className="flex items-center gap-2">
          <Verified width={24} height={24} className="text-primary" />
          <p>
            {personName}, {personAge}
          </p>
        </div>
        {/* Transformation */}
        <div className="border-primary flex w-fit items-center gap-2 rounded-full border px-3 py-2.5">
          <p className="text-sm sm:text-base">{startWeight} lbs</p>
          <ShortArrowRightFill width={20} height={20} />
          <p className="text-sm sm:text-base">{endWeight} lbs</p>
        </div>
      </div>
    </div>
  );
};

export default TestimonialCard;
