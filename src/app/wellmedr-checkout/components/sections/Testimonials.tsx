import { testimonials } from '@/app/wellmedr-checkout/data/testimonials';
import { Fragment } from 'react';
import TestimonialCard from '../TestimonialCard';

export default function Testimonials() {
  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="text-center">
        <h3 className="checkout-title">
          The results speak{' '}
          <span className="inline sm:hidden">
            <br />
          </span>
          for themselves!
        </h3>
        <p>
          Wellmedr success stories are pouring in,
          <br /> and we can not get enough.
        </p>
      </div>

      {/* Testimonials */}
      <div className="flex flex-col gap-4 sm:flex-row">
        {testimonials.map((testimonial, idx) => (
          <Fragment key={`tstm_${idx}`}>
            <TestimonialCard testimonial={testimonial} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
