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
    <div className="card p-6 drop-shadow-md flex-1 flex flex-col gap-8 justify-between">
      <div className="flex flex-col gap-8">
        <div className="flex gap-2">
          <div className="relative w-full min-h-[246px] flex-1 rounded-smooth">
            <Image
              src={beforeImg}
              alt="Testimonial"
              fill
              placeholder="blur"
              sizes="(max-width: 640px) 50vw, 300px"
              className="object-cover object-center flex-1 rounded-smooth"
              loading="lazy"
            />

            <div className="absolute bottom-0 py-2 5 left-0 right-0 flex items-center justify-center">
              <p className="text-sm whitespace-nowrap inline-flex px-3 py-2.5 border border-white/40 rounded-full bg-black/20 backdrop-blur-sm text-white min-w-fit">
                Month 0
              </p>
            </div>
          </div>

          <div className="relative w-full min-h-[246px] flex-1 rounded-smooth">
            <Image
              src={afterImg}
              alt="Testimonial"
              fill
              placeholder="blur"
              sizes="(max-width: 640px) 50vw, 300px"
              className="object-cover object-center flex-1 rounded-smooth"
              loading="lazy"
            />

            <div className="absolute bottom-0 py-2 5 left-0 right-0 flex items-center justify-center">
              <p className="text-sm whitespace-nowrap inline-flex px-3 py-2.5 border border-white/40 rounded-full bg-black/20 backdrop-blur-sm text-white min-w-fit">
                Month {progressInMonths}
              </p>
            </div>
          </div>
        </div>
        <div>
          <h4 className="title text-[1.5rem] mb-2">{title}</h4>
          <p className="text-sm sm:text-base opacity-80">{testimonialText}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Person Name */}
        <div className="flex gap-2 items-center">
          <Verified width={24} height={24} className="text-primary" />
          <p>
            {personName}, {personAge}
          </p>
        </div>
        {/* Transformation */}
        <div className="flex items-center gap-2 border border-primary rounded-full py-2.5 px-3 w-fit">
          <p className="text-sm sm:text-base">{startWeight} lbs</p>
          <ShortArrowRightFill width={20} height={20} />
          <p className="text-sm sm:text-base">{endWeight} lbs</p>
        </div>
      </div>
    </div>
  );
};

export default TestimonialCard;
