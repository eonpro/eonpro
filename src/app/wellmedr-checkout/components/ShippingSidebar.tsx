'use client';

import { useState, useEffect, useCallback } from 'react';

const REVIEWS = [
  {
    title: 'Manny answered the phone on the first...',
    text: 'Manny answered the phone on the first ring. He explained the differences between tirzepatide and semaglutide. He was knowledgeable about the differences, how to tell which is better for my particular journey and I am very happy with this phone call and product.',
    name: 'Anne C.',
    badge: 'Verified GLP-1 User',
    date: '25 Mar, 2026',
    initials: 'AC',
    color: '#c3b29e',
  },
  {
    title: 'Wellmedr helped me achieve my goal!',
    text: 'Wellmedr helped me achieve my goal weight! The providers I worked with throughout the process were incredibly supportive and the results speak for themselves.',
    name: 'Neal P.',
    badge: 'Verified Member',
    date: 'November 18, 2025',
    initials: 'NP',
    color: '#7B95A9',
  },
  {
    title: 'Life-changing experience',
    text: "The team at WellMedR was incredibly responsive and helpful throughout my weight loss journey. The medication arrived quickly and the results have been amazing. I've never felt better!",
    name: 'Sarah M.',
    badge: 'Verified GLP-1 User',
    date: '12 Feb, 2026',
    initials: 'SM',
    color: '#8B7355',
  },
];

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export default function ShippingSidebar() {
  const [activeReview, setActiveReview] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const next = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setActiveReview((prev) => (prev + 1) % REVIEWS.length);
      setIsAnimating(false);
    }, 200);
  }, []);

  const prevReview = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setActiveReview((p) => (p - 1 + REVIEWS.length) % REVIEWS.length);
      setIsAnimating(false);
    }, 200);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 7000);
    return () => clearInterval(timer);
  }, [next]);

  const review = REVIEWS[activeReview];

  return (
    <div className="flex flex-col gap-8">
      {/* Social proof heading */}
      <div>
        <h2 className="text-[1.65rem] font-bold leading-tight" style={{ color: '#101010' }}>
          Join <span style={{ color: '#22c55e' }}>40,000+</span> weight loss patients
        </h2>
      </div>

      {/* Expectations */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: '#f0fdf4', border: '1px solid rgba(34,197,94,0.15)' }}
      >
        <p className="mb-3 text-sm font-bold tracking-wide" style={{ color: '#101010' }}>
          What to expect next?
        </p>
        <div className="flex flex-col gap-3">
          {[
            'Instant access to patient portal',
            'Doctor approval within ~4 hours',
            'Meds ship within 48-72 hours',
          ].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500">
                <svg
                  className="h-3.5 w-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <span className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonial carousel */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #fafbfc 100%)',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {/* Green accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-green-400 to-green-500" />

        <div
          className="p-6"
          style={{
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? 'translateX(12px)' : 'translateX(0)',
            transition: 'all 0.2s ease-out',
          }}
        >
          {/* Stars */}
          <div className="mb-4 flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <StarIcon key={i} className="h-5 w-5 text-green-500" />
            ))}
          </div>

          {/* Review title */}
          <p className="mb-2 text-base font-bold leading-snug" style={{ color: '#101010' }}>
            {review.title}
          </p>

          {/* Review text */}
          <p className="mb-5 text-sm leading-relaxed" style={{ color: '#555' }}>
            {review.text}
          </p>

          {/* Reviewer */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-bold tracking-wide text-white"
              style={{
                backgroundColor: review.color,
                boxShadow: `0 2px 8px ${review.color}40`,
              }}
            >
              {review.initials}
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: '#101010' }}>
                {review.name}
              </p>
              <div className="flex items-center gap-1.5">
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
                  <svg
                    className="h-2.5 w-2.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                  {review.badge}
                </span>
              </div>
            </div>
          </div>

          {/* Date */}
          <p className="mt-3 text-xs font-medium" style={{ color: '#aaa' }}>
            Date of Experience: {review.date}
          </p>
        </div>

        {/* Nav arrows */}
        <button
          onClick={prevReview}
          className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md active:scale-95"
          style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          aria-label="Previous review"
        >
          <svg
            className="h-4 w-4"
            style={{ color: '#333' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <button
          onClick={next}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md active:scale-95"
          style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          aria-label="Next review"
        >
          <svg
            className="h-4 w-4"
            style={{ color: '#333' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Dots */}
        <div className="flex justify-center gap-2 pb-5">
          {REVIEWS.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setIsAnimating(true);
                setTimeout(() => {
                  setActiveReview(i);
                  setIsAnimating(false);
                }, 200);
              }}
              className={`rounded-full transition-all duration-300 ${
                i === activeReview
                  ? 'h-2.5 w-6 bg-[#0C2631]'
                  : 'h-2.5 w-2.5 bg-gray-300 hover:bg-gray-400'
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
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-100"
          style={{ color: '#101010' }}
        >
          Read TrustPilot Reviews
          <StarIcon className="h-4 w-4 text-green-500" />
        </a>
      </div>
    </div>
  );
}
