export type TestimonialType = {
  title: string;
  testimonial: string;
  personName: string;
  personAge: number;
  startWeight: number;
  endWeight: number;
  progressInMonths: number;
  beforeImg: string;
  afterImg: string;
};

export const testimonials: TestimonialType[] = [
  {
    title: "I've lost 37 lbs in 4 months",
    testimonial:
      'When I started Tirzepatide, I weighed 178 lbs. Four months later, I\'m down to 141 lbs — that\'s almost 40 pounds gone. It became so much easier to make healthier choices. I finally feel in control of my appetite.',
    personName: 'Melissa',
    personAge: 44,
    startWeight: 178,
    endWeight: 141,
    progressInMonths: 4,
    beforeImg: '/assets/images/testimonials/1-before.webp',
    afterImg: '/assets/images/testimonials/1-after.webp',
  },
  {
    title: "I've lost 34 lbs in 5 months",
    testimonial:
      "After my second pregnancy, I couldn't seem to lose the extra pounds no matter what I tried. Finally, I found Wellmedr and I started Semaglutide at 167 lbs, and in just 5 months I reached 133 lbs. The difference in my energy is unbelievable, this has been life-changing for me.",
    personName: 'Elena',
    personAge: 41,
    startWeight: 167,
    endWeight: 133,
    progressInMonths: 5,
    beforeImg: '/assets/images/testimonials/2-before.webp',
    afterImg: '/assets/images/testimonials/2-after.webp',
  },
];
