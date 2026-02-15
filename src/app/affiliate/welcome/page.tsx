'use client';

/**
 * Affiliate Welcome / Onboarding Page
 *
 * First-time setup experience for new affiliates.
 * Reached via email link: /affiliate/welcome?token=xxx
 *
 * Steps:
 * 1. Welcome — greeting + compensation plan display
 * 2. Profile — update name, phone, address
 * 3. Password — set secure password with strength meter
 * 4. Success — confetti-style celebration, auto-login redirect
 *
 * Only shown once (when User.lastPasswordChange is null).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  DollarSign,
  Repeat,
  User,
  Shield,
  Sparkles,
  MapPin,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type OnboardingStep = 'loading' | 'invalid' | 'welcome' | 'profile' | 'password' | 'success';

interface OnboardingData {
  affiliate: {
    id: number;
    displayName: string;
    refCodes: string[];
  };
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  clinic: {
    name: string;
    logoUrl: string | null;
    primaryColor: string;
  };
  compensationPlan: {
    name: string;
    description: string | null;
    details: { label: string; value: string; highlight?: boolean }[];
  } | null;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
}

interface PasswordCheck {
  label: string;
  test: (pw: string) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const PASSWORD_CHECKS: PasswordCheck[] = [
  { label: 'At least 12 characters', test: (pw) => pw.length >= 12 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /\d/.test(pw) },
  { label: 'One special character', test: (pw) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

// ============================================================================
// Helpers
// ============================================================================

function getTextColorForBg(hex: string, mode: 'auto' | 'light' | 'dark'): string {
  if (mode === 'light') return '#ffffff';
  if (mode === 'dark') return '#1f2937';
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#ffffff';
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#1f2937' : '#ffffff';
}

function getStrengthLevel(password: string) {
  const passed = PASSWORD_CHECKS.filter((c) => c.test(password)).length;
  if (password.length === 0) return { label: '', color: '#d1d5db', width: '0%' };
  if (passed <= 2) return { label: 'Weak', color: '#ef4444', width: '25%' };
  if (passed <= 3) return { label: 'Fair', color: '#f59e0b', width: '50%' };
  if (passed <= 4) return { label: 'Good', color: '#3b82f6', width: '75%' };
  return { label: 'Strong', color: '#10b981', width: '100%' };
}

// ============================================================================
// Component
// ============================================================================

export default function AffiliateWelcomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Step state
  const [step, setStep] = useState<OnboardingStep>('loading');
  const [invalidMessage, setInvalidMessage] = useState('');
  const [data, setData] = useState<OnboardingData | null>(null);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    displayName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
  });

  // Password form
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement>(null);

  // ──────────────────────────────────────────────────────────────────────
  // Load onboarding data on mount
  // ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setInvalidMessage('No setup token provided. Please check your email for the welcome link.');
      setStep('invalid');
      return;
    }

    const loadData = async () => {
      try {
        const res = await fetch(`/api/affiliate/auth/onboarding?token=${encodeURIComponent(token)}`);
        const json = await res.json();

        if (!json.valid) {
          if (json.redirectTo) {
            router.push(json.redirectTo);
            return;
          }
          setInvalidMessage(json.error || 'Invalid or expired link.');
          setStep('invalid');
          return;
        }

        setData(json);
        setProfileForm({
          firstName: json.user.firstName || '',
          lastName: json.user.lastName || '',
          phone: json.user.phone || '',
          displayName: json.affiliate.displayName || '',
          addressLine1: json.address.line1 || '',
          addressLine2: json.address.line2 || '',
          city: json.address.city || '',
          state: json.address.state || '',
          zipCode: json.address.zipCode || '',
        });
        setStep('welcome');
      } catch {
        setInvalidMessage('Failed to load setup data. Please try again.');
        setStep('invalid');
      }
    };

    loadData();
  }, [token, router]);

  // ──────────────────────────────────────────────────────────────────────
  // Complete onboarding
  // ──────────────────────────────────────────────────────────────────────
  const handleComplete = useCallback(async () => {
    if (!token || !data) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/affiliate/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
          displayName: profileForm.displayName || undefined,
          firstName: profileForm.firstName || undefined,
          lastName: profileForm.lastName || undefined,
          phone: profileForm.phone || undefined,
          address: {
            line1: profileForm.addressLine1 || undefined,
            line2: profileForm.addressLine2 || undefined,
            city: profileForm.city || undefined,
            state: profileForm.state || undefined,
            zipCode: profileForm.zipCode || undefined,
          },
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to complete setup');
      }

      // Store auth tokens for auto-login
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('super_admin-token');
      localStorage.removeItem('admin-token');
      localStorage.removeItem('provider-token');
      localStorage.removeItem('staff-token');

      if (json.token) {
        localStorage.setItem('affiliate-token', json.token);
        localStorage.setItem('auth-token', json.token);
        localStorage.setItem(
          'user',
          JSON.stringify({
            id: json.affiliate?.id,
            email: json.affiliate?.email,
            name: json.affiliate?.displayName,
            role: 'affiliate',
          })
        );
      }

      setStep('success');

      setTimeout(() => {
        router.push('/affiliate');
      }, 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [token, data, password, confirmPassword, profileForm, router]);

  // ──────────────────────────────────────────────────────────────────────
  // Derived values
  // ──────────────────────────────────────────────────────────────────────
  const primaryColor = data?.clinic.primaryColor || '#10B981';
  const buttonTextColor = getTextColorForBg(primaryColor, 'auto');
  const strength = getStrengthLevel(password);
  const allChecksPassed = PASSWORD_CHECKS.every((c) => c.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmitPassword = allChecksPassed && passwordsMatch && !isSubmitting;

  // Step indicator
  const steps = ['welcome', 'profile', 'password'] as const;
  const currentStepIndex = steps.indexOf(step as typeof steps[number]);

  // ──────────────────────────────────────────────────────────────────────
  // Loading / Invalid states
  // ──────────────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: '#EFECE7' }}>
        <div className="text-center">
          <div
            className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
          />
          <p className="mt-4 text-sm text-gray-500">Loading your partner setup...</p>
        </div>
      </div>
    );
  }

  if (step === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center px-6" style={{ backgroundColor: '#EFECE7' }}>
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">Link expired or invalid</h2>
          <p className="mt-3 text-sm text-gray-500">{invalidMessage}</p>
          <div className="mt-8 space-y-3">
            <a
              href="/affiliate/forgot-password"
              className="flex w-full items-center justify-center rounded-2xl px-6 py-4 font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Request new setup link
            </a>
            <a href="/affiliate/login" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" /> Back to login
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Main onboarding UI
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EFECE7' }}>
      <div className="flex min-h-screen flex-col">
        {/* Logo */}
        <div className="flex flex-col items-center pb-4 pt-10">
          {data?.clinic.logoUrl ? (
            <img src={data.clinic.logoUrl} alt={data.clinic.name} className="h-10 max-w-[180px] object-contain" />
          ) : (
            <h1 className="text-2xl font-bold" style={{ color: primaryColor }}>
              {data?.clinic.name || 'Partner Portal'}
            </h1>
          )}
        </div>

        {/* Step indicator */}
        {step !== 'success' && (
          <div className="mx-auto flex w-full max-w-md items-center justify-center gap-2 px-6 pb-6">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                    i <= currentStepIndex
                      ? 'text-white'
                      : 'border border-gray-300 bg-white text-gray-400'
                  }`}
                  style={i <= currentStepIndex ? { backgroundColor: primaryColor } : undefined}
                >
                  {i < currentStepIndex ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-8 rounded-full transition-all ${
                      i < currentStepIndex ? '' : 'bg-gray-200'
                    }`}
                    style={i < currentStepIndex ? { backgroundColor: primaryColor } : undefined}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <main className="flex flex-1 flex-col items-center px-6 py-4">
          <AnimatePresence mode="wait">
            {/* ═══════════════════════════════════════════════════════════ */}
            {/* STEP 1: Welcome + Compensation Plan                       */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {step === 'welcome' && data && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
              >
                {/* Greeting */}
                <div className="mb-6 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', duration: 0.6, delay: 0.1 }}
                    className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <Sparkles className="h-7 w-7" style={{ color: primaryColor }} />
                  </motion.div>
                  <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    Welcome, {data.user.firstName}!
                  </h1>
                  <p className="mt-2 text-sm text-gray-500">
                    You&apos;re now a partner with <strong className="text-gray-700">{data.clinic.name}</strong>.
                    Let&apos;s get your account set up in just a few steps.
                  </p>
                </div>

                {/* Ref Code */}
                {data.affiliate.refCodes.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 text-center"
                  >
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Your referral code</p>
                    <p className="mt-1 text-2xl font-bold tracking-widest text-gray-900">
                      {data.affiliate.refCodes[0]}
                    </p>
                  </motion.div>
                )}

                {/* Compensation Plan */}
                {data.compensationPlan && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mb-6 rounded-2xl border border-gray-200 bg-white p-5"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Your Compensation Plan
                      </p>
                    </div>
                    <h3 className="mb-3 text-lg font-semibold text-gray-900">
                      {data.compensationPlan.name}
                    </h3>
                    {data.compensationPlan.description && (
                      <p className="mb-4 text-sm text-gray-500">{data.compensationPlan.description}</p>
                    )}
                    <div className="space-y-3">
                      {data.compensationPlan.details.map((detail, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {detail.highlight ? (
                              <DollarSign className="h-4 w-4" style={{ color: primaryColor }} />
                            ) : (
                              <Repeat className="h-4 w-4 text-gray-400" />
                            )}
                            <span className="text-sm text-gray-600">{detail.label}</span>
                          </div>
                          <span
                            className={`text-sm font-bold ${detail.highlight ? '' : 'text-gray-700'}`}
                            style={detail.highlight ? { color: primaryColor } : undefined}
                          >
                            {detail.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Continue button */}
                <button
                  onClick={() => setStep('profile')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </button>
              </motion.div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* STEP 2: Profile Update                                    */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {step === 'profile' && data && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
              >
                <button
                  onClick={() => setStep('welcome')}
                  className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>

                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-400" />
                    <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Step 2 of 3
                    </span>
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Confirm your info</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Review and update your details. You can change these later too.
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">First name</label>
                      <input
                        type="text"
                        value={profileForm.firstName}
                        onChange={(e) => setProfileForm((p) => ({ ...p, firstName: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500">Last name</label>
                      <input
                        type="text"
                        value={profileForm.lastName}
                        onChange={(e) => setProfileForm((p) => ({ ...p, lastName: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                    </div>
                  </div>

                  {/* Display name */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Display name</label>
                    <input
                      type="text"
                      value={profileForm.displayName}
                      onChange={(e) => setProfileForm((p) => ({ ...p, displayName: e.target.value }))}
                      placeholder="How you want to appear publicly"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>

                  {/* Email (read-only) */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
                    <input
                      type="email"
                      value={data.user.email}
                      readOnly
                      className="w-full cursor-not-allowed rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-500"
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Phone number</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+1 (555) 000-0000"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>

                  {/* Address section */}
                  <div className="pt-2">
                    <div className="mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-400">Address</span>
                    </div>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={profileForm.addressLine1}
                        onChange={(e) => setProfileForm((p) => ({ ...p, addressLine1: e.target.value }))}
                        placeholder="Street address"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                      <input
                        type="text"
                        value={profileForm.addressLine2}
                        onChange={(e) => setProfileForm((p) => ({ ...p, addressLine2: e.target.value }))}
                        placeholder="Apt, suite, etc. (optional)"
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      />
                      <div className="grid grid-cols-5 gap-3">
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={profileForm.city}
                            onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))}
                            placeholder="City"
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                          />
                        </div>
                        <div className="col-span-1">
                          <select
                            value={profileForm.state}
                            onChange={(e) => setProfileForm((p) => ({ ...p, state: e.target.value }))}
                            className="w-full rounded-xl border border-gray-200 bg-white px-2 py-3 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                          >
                            <option value="">State</option>
                            {US_STATES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={profileForm.zipCode}
                            onChange={(e) => setProfileForm((p) => ({ ...p, zipCode: e.target.value }))}
                            placeholder="ZIP code"
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Continue */}
                <button
                  onClick={() => {
                    setStep('password');
                    setTimeout(() => passwordRef.current?.focus(), 150);
                  }}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all hover:opacity-90"
                  style={{ backgroundColor: primaryColor, color: buttonTextColor }}
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </button>
              </motion.div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* STEP 3: Set Password                                      */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {step === 'password' && data && (
              <motion.div
                key="password"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-md"
              >
                <button
                  onClick={() => setStep('profile')}
                  className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>

                <div className="mb-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-gray-400" />
                    <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
                      Step 3 of 3
                    </span>
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Set your password</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Create a strong password to secure your partner account.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canSubmitPassword) handleComplete();
                  }}
                  className="space-y-4"
                >
                  {/* New password */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
                    <div className="relative">
                      <input
                        ref={passwordRef}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 pr-12 text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {password.length > 0 && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 rounded-full bg-gray-100">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: strength.color, width: strength.width }}
                            initial={{ width: '0%' }}
                            animate={{ width: strength.width }}
                          />
                        </div>
                        <span className="text-xs font-medium" style={{ color: strength.color }}>
                          {strength.label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm password</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 pr-12 text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p className="mt-1.5 text-xs text-red-500">Passwords do not match</p>
                    )}
                  </div>

                  {/* Requirements */}
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">Requirements</p>
                    <div className="space-y-1.5">
                      {PASSWORD_CHECKS.map((check) => {
                        const passed = check.test(password);
                        return (
                          <div key={check.label} className="flex items-center gap-2">
                            {password.length === 0 ? (
                              <div className="h-4 w-4 rounded-full border border-gray-300" />
                            ) : passed ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-gray-300" />
                            )}
                            <span className={`text-xs ${password.length === 0 ? 'text-gray-500' : passed ? 'text-green-700' : 'text-gray-400'}`}>
                              {check.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-red-200 bg-red-50 p-4">
                      <p className="text-center text-sm text-red-600">{error}</p>
                    </motion.div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={!canSubmitPassword}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 font-semibold transition-all ${
                      !canSubmitPassword ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'
                    }`}
                    style={{
                      backgroundColor: !canSubmitPassword ? '#9CA3AF' : primaryColor,
                      color: buttonTextColor,
                    }}
                  >
                    {isSubmitting ? (
                      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <>
                        Complete setup
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* STEP 4: Success                                            */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {step === 'success' && data && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-md text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.6 }}
                  className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${primaryColor}15` }}
                >
                  <Sparkles className="h-10 w-10" style={{ color: primaryColor }} />
                </motion.div>

                <h2 className="text-3xl font-semibold text-gray-900">You&apos;re all set!</h2>
                <p className="mt-3 text-sm text-gray-500">
                  Welcome to the <strong>{data.clinic.name}</strong> partner program.
                  <br />
                  Redirecting you to your dashboard...
                </p>

                {/* Progress bar */}
                <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-gray-100">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: primaryColor }}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 3.5 }}
                  />
                </div>

                <a
                  href="/affiliate"
                  className="mt-6 inline-flex items-center gap-1 text-sm font-medium hover:opacity-80"
                  style={{ color: primaryColor }}
                >
                  Go to dashboard now <ArrowRight className="h-4 w-4" />
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center">
          <p className="text-xs text-gray-500">
            Need help?{' '}
            <a
              href={`mailto:support@${data?.clinic.name?.toLowerCase().replace(/\s+/g, '') || 'eonpro'}.com`}
              className="font-medium hover:opacity-80"
              style={{ color: primaryColor }}
            >
              Contact support
            </a>
          </p>
          <p className="mt-2 text-xs text-gray-400">&copy; 2026 EONPro &bull; Partner Portal</p>
        </footer>
      </div>
    </div>
  );
}
