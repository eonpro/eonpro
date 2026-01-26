'use client';

/**
 * Affiliate Application Page
 * 
 * Public form for applying to become an affiliate.
 * Collects: Full name, Phone, Email, Address, Social media profiles.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface ClinicBranding {
  clinicId: number;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonTextColor: 'auto' | 'light' | 'dark';
}

interface SocialProfile {
  platform: 'instagram' | 'facebook' | 'twitter' | 'youtube' | 'tiktok' | 'linkedin' | 'other';
  url: string;
  handle?: string;
}

type FormStep = 'info' | 'address' | 'social' | 'review' | 'success';

const SOCIAL_PLATFORMS = [
  { id: 'instagram', name: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
  { id: 'facebook', name: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
  { id: 'twitter', name: 'X (Twitter)', placeholder: 'https://x.com/yourhandle' },
  { id: 'youtube', name: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  { id: 'tiktok', name: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
  { id: 'linkedin', name: 'LinkedIn', placeholder: 'https://linkedin.com/in/yourprofile' },
  { id: 'other', name: 'Other', placeholder: 'https://yourwebsite.com' },
] as const;

const AUDIENCE_SIZES = [
  { value: '1K-10K', label: '1K - 10K followers' },
  { value: '10K-50K', label: '10K - 50K followers' },
  { value: '50K-100K', label: '50K - 100K followers' },
  { value: '100K+', label: '100K+ followers' },
];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// Helper function to calculate text color based on background luminance
function getTextColorForBg(hex: string, mode: 'auto' | 'light' | 'dark'): string {
  if (mode === 'light') return '#ffffff';
  if (mode === 'dark') return '#1f2937';

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#ffffff';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

export default function AffiliateApplyPage() {
  const [step, setStep] = useState<FormStep>('info');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    socialProfiles: [] as SocialProfile[],
    website: '',
    audienceSize: '',
    promotionPlan: '',
  });

  // Social media form state
  const [newSocialPlatform, setNewSocialPlatform] = useState<SocialProfile['platform']>('instagram');
  const [newSocialUrl, setNewSocialUrl] = useState('');

  // Load clinic branding
  useEffect(() => {
    const resolveClinic = async () => {
      try {
        const domain = window.location.hostname;
        const response = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);

        if (response.ok) {
          const data = await response.json();
          setBranding({
            clinicId: data.clinicId,
            name: data.name,
            logoUrl: data.branding.logoUrl,
            primaryColor: data.branding.primaryColor,
            secondaryColor: data.branding.secondaryColor,
            accentColor: data.branding.accentColor,
            buttonTextColor: data.branding.buttonTextColor || 'auto',
          });
          document.title = `Become a Partner | ${data.name}`;
        }
      } catch (err) {
        console.log('Using default branding');
      } finally {
        setBrandingLoaded(true);
      }
    };

    resolveClinic();
  }, []);

  // Format phone number
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === 'phone') {
      value = formatPhone(value);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const addSocialProfile = () => {
    if (!newSocialUrl.trim()) {
      setError('Please enter a social media URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(newSocialUrl);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    // Check for duplicates
    if (formData.socialProfiles.some((p) => p.platform === newSocialPlatform)) {
      setError(`You've already added a ${SOCIAL_PLATFORMS.find((p) => p.id === newSocialPlatform)?.name} profile`);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      socialProfiles: [...prev.socialProfiles, { platform: newSocialPlatform, url: newSocialUrl.trim() }],
    }));
    setNewSocialUrl('');
    setError(null);
  };

  const removeSocialProfile = (platform: string) => {
    setFormData((prev) => ({
      ...prev,
      socialProfiles: prev.socialProfiles.filter((p) => p.platform !== platform),
    }));
  };

  const validateStep = (currentStep: FormStep): boolean => {
    setError(null);

    switch (currentStep) {
      case 'info':
        if (!formData.fullName.trim()) {
          setError('Full name is required');
          return false;
        }
        if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          setError('Please enter a valid email address');
          return false;
        }
        if (formData.phone.replace(/\D/g, '').length !== 10) {
          setError('Please enter a valid 10-digit phone number');
          return false;
        }
        return true;

      case 'address':
        if (!formData.addressLine1.trim()) {
          setError('Address is required');
          return false;
        }
        if (!formData.city.trim()) {
          setError('City is required');
          return false;
        }
        if (!formData.state) {
          setError('State is required');
          return false;
        }
        if (!formData.zipCode.trim() || formData.zipCode.length < 5) {
          setError('Please enter a valid ZIP code');
          return false;
        }
        return true;

      case 'social':
        if (formData.socialProfiles.length === 0) {
          setError('Please add at least one social media profile');
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!validateStep(step)) return;

    const steps: FormStep[] = ['info', 'address', 'social', 'review', 'success'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 2) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: FormStep[] = ['info', 'address', 'social', 'review', 'success'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  // Colors
  const primaryColor = branding?.primaryColor || '#10B981';
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);

  // Loading state
  if (!brandingLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EFECE7' }}>
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EFECE7' }}>
      <div className="min-h-screen flex flex-col">
        {/* Logo */}
        <div className="flex flex-col items-center pt-8 pb-4">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.name} className="h-10 max-w-[180px] object-contain" />
          ) : (
            <h1 className="text-2xl font-bold" style={{ color: primaryColor }}>
              {branding?.name || 'EONPRO'}
            </h1>
          )}
        </div>

        {/* Progress indicator */}
        {step !== 'success' && (
          <div className="flex justify-center gap-2 pb-6">
            {['info', 'address', 'social', 'review'].map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-all ${
                  s === step ? 'w-6' : ''
                }`}
                style={{
                  backgroundColor: ['info', 'address', 'social', 'review'].indexOf(step) >= i 
                    ? primaryColor 
                    : '#D1D5DB',
                }}
              />
            ))}
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col items-center px-4 pb-8">
          <AnimatePresence mode="wait">
            {step === 'info' && (
              <motion.div
                key="info"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-md"
              >
                <h2 className="text-3xl font-light text-gray-900 text-center mb-2">Become a Partner</h2>
                <p className="text-gray-600 text-center mb-6">Start earning by sharing products you love</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange('fullName', e.target.value)}
                      placeholder="Your full legal name"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">+1</span>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="(555) 555-5555"
                        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl"
                  >
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </motion.div>
                )}

                <button
                  onClick={nextStep}
                  className="w-full mt-6 px-6 py-4 rounded-xl font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  Continue
                </button>

                <p className="mt-4 text-center text-sm text-gray-500">
                  Already a partner?{' '}
                  <Link href="/affiliate/login" className="font-medium hover:opacity-80" style={{ color: primaryColor }}>
                    Sign in
                  </Link>
                </p>
              </motion.div>
            )}

            {step === 'address' && (
              <motion.div
                key="address"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-md"
              >
                <button onClick={prevStep} className="mb-4 text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                <h2 className="text-3xl font-light text-gray-900 text-center mb-2">Your Address</h2>
                <p className="text-gray-600 text-center mb-6">For commission payments and tax documents</p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 *</label>
                    <input
                      type="text"
                      value={formData.addressLine1}
                      onChange={(e) => handleInputChange('addressLine1', e.target.value)}
                      placeholder="Street address"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                    <input
                      type="text"
                      value={formData.addressLine2}
                      onChange={(e) => handleInputChange('addressLine2', e.target.value)}
                      placeholder="Apt, suite, unit (optional)"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => handleInputChange('city', e.target.value)}
                        placeholder="City"
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                      <select
                        value={formData.state}
                        onChange={(e) => handleInputChange('state', e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      >
                        <option value="">Select</option>
                        {US_STATES.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
                    <input
                      type="text"
                      value={formData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value.replace(/\D/g, '').slice(0, 5))}
                      placeholder="12345"
                      maxLength={5}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl"
                  >
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </motion.div>
                )}

                <button
                  onClick={nextStep}
                  className="w-full mt-6 px-6 py-4 rounded-xl font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  Continue
                </button>
              </motion.div>
            )}

            {step === 'social' && (
              <motion.div
                key="social"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-md"
              >
                <button onClick={prevStep} className="mb-4 text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                <h2 className="text-3xl font-light text-gray-900 text-center mb-2">Social Profiles</h2>
                <p className="text-gray-600 text-center mb-6">Add at least one social media profile</p>

                {/* Added profiles */}
                {formData.socialProfiles.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {formData.socialProfiles.map((profile) => (
                      <div
                        key={profile.platform}
                        className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">
                            {SOCIAL_PLATFORMS.find((p) => p.id === profile.platform)?.name}
                          </span>
                          <span className="text-sm text-gray-500 truncate max-w-[180px]">{profile.url}</span>
                        </div>
                        <button
                          onClick={() => removeSocialProfile(profile.platform)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new profile */}
                <div className="space-y-3">
                  <select
                    value={newSocialPlatform}
                    onChange={(e) => setNewSocialPlatform(e.target.value as SocialProfile['platform'])}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                  >
                    {SOCIAL_PLATFORMS.filter(
                      (p) => !formData.socialProfiles.some((sp) => sp.platform === p.id)
                    ).map((platform) => (
                      <option key={platform.id} value={platform.id}>
                        {platform.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newSocialUrl}
                      onChange={(e) => {
                        setNewSocialUrl(e.target.value);
                        setError(null);
                      }}
                      placeholder={SOCIAL_PLATFORMS.find((p) => p.id === newSocialPlatform)?.placeholder}
                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                    <button
                      onClick={addSocialProfile}
                      className="px-4 py-3 rounded-xl font-medium transition-all hover:opacity-90"
                      style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Optional fields */}
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Audience Size (optional)
                    </label>
                    <select
                      value={formData.audienceSize}
                      onChange={(e) => handleInputChange('audienceSize', e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    >
                      <option value="">Select your total audience</option>
                      {AUDIENCE_SIZES.map((size) => (
                        <option key={size.value} value={size.value}>{size.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      How do you plan to promote? (optional)
                    </label>
                    <textarea
                      value={formData.promotionPlan}
                      onChange={(e) => handleInputChange('promotionPlan', e.target.value)}
                      placeholder="Tell us about your content style, audience demographics, etc."
                      rows={3}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent resize-none"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl"
                  >
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </motion.div>
                )}

                <button
                  onClick={() => {
                    if (validateStep('social')) setStep('review');
                  }}
                  className="w-full mt-6 px-6 py-4 rounded-xl font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  Review Application
                </button>
              </motion.div>
            )}

            {step === 'review' && (
              <motion.div
                key="review"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full max-w-md"
              >
                <button onClick={prevStep} className="mb-4 text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                <h2 className="text-3xl font-light text-gray-900 text-center mb-2">Review & Submit</h2>
                <p className="text-gray-600 text-center mb-6">Please verify your information</p>

                <div className="space-y-4">
                  <div className="p-4 bg-white rounded-xl border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Contact</h3>
                    <p className="font-medium text-gray-900">{formData.fullName}</p>
                    <p className="text-gray-600">{formData.email}</p>
                    <p className="text-gray-600">+1 {formData.phone}</p>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Address</h3>
                    <p className="text-gray-900">{formData.addressLine1}</p>
                    {formData.addressLine2 && <p className="text-gray-900">{formData.addressLine2}</p>}
                    <p className="text-gray-600">
                      {formData.city}, {formData.state} {formData.zipCode}
                    </p>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Social Profiles</h3>
                    {formData.socialProfiles.map((profile) => (
                      <div key={profile.platform} className="flex items-center gap-2 text-gray-900">
                        <span className="font-medium">
                          {SOCIAL_PLATFORMS.find((p) => p.id === profile.platform)?.name}:
                        </span>
                        <a
                          href={profile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#b5a05a] hover:underline truncate"
                        >
                          {profile.url}
                        </a>
                      </div>
                    ))}
                    {formData.audienceSize && (
                      <p className="text-gray-600 mt-2">Audience: {formData.audienceSize}</p>
                    )}
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl"
                  >
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </motion.div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className={`w-full mt-6 px-6 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                  }`}
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  {isLoading ? (
                    <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Submit Application'
                  )}
                </button>

                <p className="mt-4 text-center text-xs text-gray-500">
                  By submitting, you agree to our{' '}
                  <a href="/terms" className="underline">Terms of Service</a> and{' '}
                  <a href="/privacy" className="underline">Privacy Policy</a>
                </p>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.5 }}
                  className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <svg
                    className="w-10 h-10"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: primaryColor }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>

                <h2 className="text-3xl font-light text-gray-900 mb-4">Application Submitted!</h2>
                <p className="text-gray-600 mb-8">
                  Thank you for your interest in becoming a partner. We'll review your application and get back to you
                  within 2-3 business days.
                </p>

                <div className="p-4 bg-white rounded-xl border border-gray-200 text-left mb-6">
                  <h3 className="font-semibold text-gray-900 mb-2">What happens next?</h3>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      Our team will review your application
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      You'll receive an email once approved
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      Start earning commissions on referrals
                    </li>
                  </ul>
                </div>

                <Link
                  href="/"
                  className="inline-block px-6 py-3 rounded-xl font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  Return Home
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="p-4 text-center">
          <p className="text-xs text-gray-400">
            © 2026 {branding?.name || 'EONPRO'} • Partner Program
          </p>
        </footer>
      </div>
    </div>
  );
}
