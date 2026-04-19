'use client';

import { useState, useEffect, useCallback } from 'react';

const REVIEWS = [
  {
    title: 'Manny answered the phone on the first...',
    text: 'Manny answered the phone on the first ring. He explained the differences between tirzepatide and semaglutide. He was knowledgeable about the differences, how to tell which is better for my particular journey and I am very happy with this phone call and product.',
    name: 'Anne C.',
    badge: 'Verified GLP-1 User',
    date: '25 Mar, 2026',
    avatar: '/images/anne-avatar.jpg',
    initials: 'AC',
    color: '#c3b29e',
  },
  {
    title: 'Wellmedr helped me achieve my goal!',
    text: 'Wellmedr helped me achieve my goal weight! The providers I worked with throughout the process were incredibly supportive and the results speak for themselves.',
    name: 'Neal P.',
    badge: 'Verified Member',
    date: 'November 18, 2025',
    avatar: null,
    initials: 'NP',
    color: '#7B95A9',
  },
  {
    title: 'Life-changing experience',
    text: "The team at WellMedR was incredibly responsive and helpful throughout my weight loss journey. The medication arrived quickly and the results have been amazing. I've never felt better!",
    name: 'Sarah M.',
    badge: 'Verified GLP-1 User',
    date: '12 Feb, 2026',
    avatar: null,
    initials: 'SM',
    color: '#8B7355',
  },
];

function TrustPilotStar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.5l2.76 6.53L22 8.9l-5.19 4.47 1.55 7.13L12 17.27 5.64 20.5l1.55-7.13L2 8.9l7.24-.87L12 1.5z" />
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
    <div className="flex flex-col gap-7">
      {/* Social proof heading */}
      <div>
        <h2 className="text-[1.5rem] font-bold leading-tight" style={{ color: '#101010' }}>
          Join <span style={{ color: '#22c55e' }}>40,000+</span> weight loss patients
        </h2>
      </div>

      {/* Expectations */}
      <div
        className="rounded-xl p-5"
        style={{ backgroundColor: '#f0fdf4', border: '1px solid rgba(34,197,94,0.12)' }}
      >
        <p className="mb-3 text-sm font-bold tracking-wide" style={{ color: '#101010' }}>
          What to expect next?
        </p>
        <div className="flex flex-col gap-2.5">
          {[
            'Instant access to patient portal',
            'Doctor approval within ~4 hours',
            'Meds ship within 48-72 hours',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500">
                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-[13px] font-medium" style={{ color: '#1a1a1a' }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonial card */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.07)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <div
          className="p-5"
          style={{
            opacity: isAnimating ? 0 : 1,
            transform: isAnimating ? 'translateX(8px)' : 'translateX(0)',
            transition: 'all 0.2s ease-out',
          }}
        >
          {/* TrustPilot-style green stars */}
          <div className="mb-3 flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex h-5 w-5 items-center justify-center rounded-sm" style={{ backgroundColor: '#00b67a' }}>
                <TrustPilotStar className="h-3.5 w-3.5 text-white" />
              </div>
            ))}
          </div>

          {/* Review title */}
          <p className="mb-1.5 text-[12px] font-bold leading-snug" style={{ color: '#101010' }}>
            {review.title}
          </p>

          {/* Review text */}
          <p className="mb-4 text-[11px] leading-relaxed" style={{ color: '#555', lineHeight: '1.55' }}>
            {review.text}
          </p>

          {/* Reviewer */}
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: review.color }}
            >
              {review.initials}
            </div>
            <div>
              <p className="text-[11px] font-bold" style={{ color: '#101010' }}>
                {review.name}
              </p>
              <div className="flex items-center gap-1">
                <div className="flex h-3 w-3 items-center justify-center rounded-full" style={{ backgroundColor: '#00b67a' }}>
                  <svg className="h-1.5 w-1.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-[10px] font-medium" style={{ color: '#00b67a' }}>
                  {review.badge}
                </span>
              </div>
            </div>
          </div>

          {/* Date */}
          <p className="mt-2 text-[10px]" style={{ color: '#aaa' }}>
            Date of Experience: {review.date}
          </p>
        </div>

        {/* Nav arrows */}
        <button
          onClick={prevReview}
          className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md active:scale-95"
          style={{ borderColor: 'rgba(0,0,0,0.06)' }}
          aria-label="Previous review"
        >
          <svg className="h-3.5 w-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={next}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md active:scale-95"
          style={{ borderColor: 'rgba(0,0,0,0.06)' }}
          aria-label="Next review"
        >
          <svg className="h-3.5 w-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 pb-4">
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
                  ? 'h-2 w-5 bg-[#0C2631]'
                  : 'h-2 w-2 bg-gray-200 hover:bg-gray-300'
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
          className="inline-flex items-center gap-2 text-[13px] font-medium transition-colors hover:underline"
          style={{ color: '#333' }}
        >
          Read TrustPilot Reviews
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#00b67a">
            <path d="M12 1.5l2.76 6.53L22 8.9l-5.19 4.47 1.55 7.13L12 17.27 5.64 20.5l1.55-7.13L2 8.9l7.24-.87L12 1.5z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
