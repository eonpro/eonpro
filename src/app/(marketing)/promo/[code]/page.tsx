'use client';

/**
 * Affiliate Promo Landing Page
 * 
 * A beautiful, conversion-optimized landing page for affiliate campaigns.
 * URL: /promo/CODE or /promo/CODE?campaign=summer
 * 
 * Features:
 * - Auto-tracks affiliate visits
 * - Customizable per campaign
 * - Mobile-optimized design
 * - Clear CTA buttons
 */

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function PromoContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const code = params.code as string;
  const campaign = searchParams.get('campaign') || 'default';
  
  const [isTracked, setIsTracked] = useState(false);

  // Track the affiliate visit
  useEffect(() => {
    const trackVisit = async () => {
      try {
        const { autoTrack } = await import('@/lib/affiliate/tracking-client');
        await autoTrack({ refCode: code });
        setIsTracked(true);
      } catch (error) {
        console.debug('[PromoPage] Tracking error:', error);
        setIsTracked(true); // Continue anyway
      }
    };
    trackVisit();
  }, [code]);

  // Build the signup URL with tracking
  const signupUrl = `/signup?ref=${code}`;
  const learnMoreUrl = `/?ref=${code}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-8">
            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-emerald-400 text-sm font-medium">Exclusive Partner Offer</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Your Health Journey
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              Starts Here
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            Get personalized healthcare from licensed providers. 
            Consultations, prescriptions, and ongoing support - all from home.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link
              href={signupUrl}
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl
                       hover:from-emerald-600 hover:to-cyan-600 transition-all duration-200 shadow-lg shadow-emerald-500/25"
            >
              Get Started Free
            </Link>
            <Link
              href={learnMoreUrl}
              className="px-8 py-4 bg-white/10 text-white font-semibold rounded-xl border border-white/20
                       hover:bg-white/20 transition-all duration-200"
            >
              Learn More
            </Link>
          </div>

          {/* Trust Signals */}
          <div className="flex flex-wrap justify-center gap-8 text-slate-400 text-sm">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              HIPAA Compliant
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              24/7 Support
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Licensed Providers
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-5xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              ),
              title: 'Online Consultation',
              description: 'Connect with licensed healthcare providers from the comfort of your home.',
            },
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              ),
              title: 'Fast Prescriptions',
              description: 'Get prescriptions delivered to your door or sent to your local pharmacy.',
            },
            {
              icon: (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              ),
              title: 'Ongoing Care',
              description: 'Continuous support and follow-ups to ensure your treatment is working.',
            },
          ].map((feature, index) => (
            <div key={index} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-colors">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400 mb-6">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
              <p className="text-slate-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-white mb-6">
          Ready to get started?
        </h2>
        <p className="text-slate-300 mb-8">
          Join thousands of patients who have taken control of their health.
        </p>
        <Link
          href={signupUrl}
          className="inline-block px-10 py-4 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold rounded-xl
                   hover:from-emerald-600 hover:to-cyan-600 transition-all duration-200 shadow-lg shadow-emerald-500/25"
        >
          Start Your Free Consultation
        </Link>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>Partner code: {code}</p>
        </div>
      </footer>
    </div>
  );
}

export default function PromoLandingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PromoContent />
    </Suspense>
  );
}
