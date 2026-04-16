'use client';

import { useState, useEffect, useCallback } from 'react';

const REVIEWS = [
  {
    title: 'Manny answered the phone on the first...',
    text: 'Manny answered the phone on the first ring. He explained the differences between tirzepatide and semaglutide. He was knowledgeable about the differences, how to tell which is better for my particular journey and I am very happy with this phone call and product.',
    name: 'Anne C.',
    badge: 'Verified GLP-1 User',
    date: '25 Mar, 2026',
    avatar: null,
  },
  {
    title: 'Wellmedr helped me achieve my goal!',
    text: 'Wellmedr helped me achieve my goal weight! The providers I worked with throughout the process were incredibly supportive...',
    name: 'Neal P.',
    badge: 'Verified Member',
    date: 'November 18, 2025',
    avatar: null,
  },
  {
    title: 'Outstanding customer service',
    text: 'The team at WellMedR was incredibly responsive and helpful throughout my weight loss journey. The medication arrived quickly and the results have been amazing.',
    name: 'Sarah M.',
    badge: 'Verified GLP-1 User',
    date: '12 Feb, 2026',
    avatar: null,
  },
];

export default function ShippingSidebar() {
  const [activeReview, setActiveReview] = useState(0);

  const next = useCallback(() => {
    setActiveReview((prev) => (prev + 1) % REVIEWS.length);
  }, []);

  const prev = useCallback(() => {
    setActiveReview((p) => (p - 1 + REVIEWS.length) % REVIEWS.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next]);

  const review = REVIEWS[activeReview];

  return (
    <div className="flex flex-col gap-8">
      {/* Social proof heading */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: '#101010' }}>
          Join 40,000+ weight loss patients
        </h2>
      </div>

      {/* Expectations */}
      <div>
        <p className="mb-3 text-sm font-semibold" style={{ color: '#101010' }}>
          What to expect next?
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            'Instant access to patient portal',
            'Doctor approval within ~4 hours',
            'Meds ship within 48-72 hours',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <svg className="h-5 w-5 shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm" style={{ color: '#333' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonial carousel */}
      <div
        className="relative rounded-2xl p-6"
        style={{ backgroundColor: '#f9fafb', border: '1px solid rgba(0,0,0,0.06)' }}
      >
        {/* Stars */}
        <div className="mb-3 flex gap-0.5">
          {[...Array(5)].map((_, i) => (
            <svg key={i} className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>

        {/* Review title */}
        <p className="mb-2 text-sm font-bold" style={{ color: '#101010' }}>
          {review.title}
        </p>

        {/* Review text */}
        <p className="mb-4 text-sm leading-relaxed" style={{ color: '#444' }}>
          {review.text}
        </p>

        {/* Reviewer */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: '#7B95A9' }}
          >
            {review.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#101010' }}>
              {review.name}
            </p>
            <div className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs" style={{ color: '#22c55e' }}>{review.badge}</span>
            </div>
          </div>
        </div>

        {/* Date */}
        <p className="mt-2 text-xs" style={{ color: '#999' }}>
          Date of Experience: {review.date}
        </p>

        {/* Nav arrows */}
        <button
          onClick={prev}
          className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md transition-colors hover:bg-gray-50"
          aria-label="Previous review"
        >
          <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={next}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md transition-colors hover:bg-gray-50"
          aria-label="Next review"
        >
          <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Dots */}
        <div className="mt-4 flex justify-center gap-1.5">
          {REVIEWS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveReview(i)}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === activeReview ? 'bg-[#0C2631]' : 'bg-gray-300'
              }`}
              aria-label={`Go to review ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Trustpilot link */}
      <div className="text-center">
        <a
          href="https://www.trustpilot.com/review/wellmedr.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
          style={{ color: '#101010' }}
        >
          Read TrustPilot Reviews
          <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
