'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Building2,
  Check,
  Mail,
  User,
  Phone,
  Calendar,
  Lock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

type RegistrationStep = 'clinic' | 'details' | 'success';

interface ClinicInfo {
  id: number;
  name: string;
  logoUrl: string | null;
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Form state
  const [step, setStep] = useState<RegistrationStep>('clinic');
  const [clinicCode, setClinicCode] = useState('');
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteValidating, setInviteValidating] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Prefill from invite link (?invite=TOKEN)
  useEffect(() => {
    const invite = searchParams.get('invite');
    if (!invite || invite.length < 32) {
      setInviteValidating(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/register/validate-invite?invite=${encodeURIComponent(invite)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.valid && data.email) {
          setInviteToken(invite);
          setEmail(data.email || '');
          setFirstName(data.firstName || '');
          setLastName(data.lastName || '');
          const rawPhone = (data.phone || '').replace(/\D/g, '');
          setPhone(
            rawPhone.length >= 10
              ? `(${rawPhone.slice(0, 3)}) ${rawPhone.slice(3, 6)}-${rawPhone.slice(6, 10)}`
              : data.phone || ''
          );
          const rawDob = data.dob || '';
          setDob(
            /^\d{4}-\d{2}-\d{2}$/.test(rawDob)
              ? rawDob
              : rawDob.includes('/')
                ? (() => {
                    const [m, d, y] = rawDob.split('/');
                    return y && m && d
                      ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
                      : rawDob;
                  })()
                : rawDob
          );
          setClinic({
            id: 0,
            name: data.clinicName || 'Your Clinic',
            logoUrl: data.clinicLogoUrl || null,
          });
          setStep('details');
        }
      } catch {
        if (!cancelled) setError('Invalid or expired invite link.');
      } finally {
        if (!cancelled) setInviteValidating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Password validation
  const passwordRequirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  const isPasswordValid = passwordRequirements.every((req) => req.met);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  // Format phone number as user types
  const formatPhoneNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  // Validate clinic code
  const handleClinicCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/validate-clinic-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clinicCode.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid clinic code');
      }

      setClinic(data.clinic);
      setStep('details');
    } catch (err: any) {
      setError(err.message || 'Failed to validate clinic code');
    } finally {
      setLoading(false);
    }
  };

  // Submit registration
  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate form
    if (!isPasswordValid) {
      setError('Please ensure your password meets all requirements');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }

    if (!agreedToTerms) {
      setError('Please agree to the terms and conditions');
      return;
    }

    setLoading(true);

    try {
      const body: Record<string, string> = {
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.replace(/\D/g, ''),
        dob,
      };
      if (inviteToken) {
        body.inviteToken = inviteToken;
      } else {
        body.clinicCode = clinicCode.trim();
      }
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Invite-based signups are auto-verified, redirect to login immediately
      if (inviteToken) {
        router.push('/patient-login?registered=true');
        return;
      }

      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Go back to previous step (only when not using invite link)
  const handleBack = () => {
    if (step === 'details' && !inviteToken) {
      setStep('clinic');
      setClinic(null);
    }
  };

  if (inviteValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7] p-4">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="mt-4 text-gray-600">Validating your invite link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#efece7] p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
            <User className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Your Account</h1>
          <p className="mt-1 text-gray-600">Patient Registration</p>
        </div>

        {/* Progress Indicator */}
        {step !== 'success' && (
          <div className="mb-8 flex items-center justify-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                step === 'clinic' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {step !== 'clinic' ? <Check className="h-4 w-4" /> : '1'}
            </div>
            <div
              className={`h-1 w-12 rounded ${step === 'details' ? 'bg-emerald-600' : 'bg-gray-200'}`}
            />
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                step === 'details' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              2
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white/80 shadow-xl backdrop-blur-sm">
          <div className="p-8">
            {/* STEP 1: Clinic Code */}
            {step === 'clinic' && (
              <form onSubmit={handleClinicCodeSubmit} className="space-y-6">
                <div className="mb-6 text-center">
                  <Building2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Enter Clinic Code</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Enter the registration code provided by your healthcare clinic
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="clinicCode"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    Clinic Code
                  </label>
                  <input
                    id="clinicCode"
                    type="text"
                    value={clinicCode}
                    onChange={(e) => setClinicCode(e.target.value.toUpperCase())}
                    placeholder="e.g., CLINIC123"
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-mono text-lg uppercase tracking-wider transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !clinicCode.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 font-semibold text-white transition-all hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>

                <div className="border-t border-gray-100 pt-4 text-center">
                  <p className="text-sm text-gray-600">
                    Already have an account?{' '}
                    <Link
                      href="/login"
                      className="font-medium text-emerald-600 hover:text-emerald-700"
                    >
                      Sign in
                    </Link>
                  </p>
                </div>
              </form>
            )}

            {/* STEP 2: Registration Details (full form) or Invite: Set password only */}
            {step === 'details' && clinic && inviteToken && (
              <form onSubmit={handleRegistrationSubmit} className="space-y-5">
                {/* Invite flow: clinic + pre-filled identity summary, then password only */}
                <div className="mb-4 text-center">
                  <p className="text-sm font-medium text-emerald-600">Invited by</p>
                  {clinic.logoUrl ? (
                    <img
                      src={clinic.logoUrl}
                      alt={clinic.name}
                      className="mx-auto mt-2 h-14 max-w-[200px] object-contain object-center"
                    />
                  ) : (
                    <p className="mt-2 font-semibold text-gray-900">{clinic.name}</p>
                  )}
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-center">
                  <p className="text-sm text-gray-600">
                    Create your password for <strong className="text-gray-900">{firstName} {lastName}</strong>
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{email}</p>
                </div>
                {/* Password */}
                <div>
                  <label
                    htmlFor="password-invite"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      id="password-invite"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-12 pr-12 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {password && (
                    <div className="mt-2 space-y-1">
                      {passwordRequirements.map((req, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {req.met ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <div className="h-3.5 w-3.5 rounded-full border border-gray-300" />
                          )}
                          <span className={req.met ? 'text-emerald-600' : 'text-gray-500'}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="confirmPassword-invite"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      id="confirmPassword-invite"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full rounded-xl border bg-white py-2.5 pl-12 pr-12 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        confirmPassword && !passwordsMatch ? 'border-red-300' : 'border-gray-200'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                  )}
                </div>
                <div className="flex items-start gap-3">
                  <label
                    htmlFor="terms-checkbox-invite"
                    className="flex min-h-[44px] min-w-[44px] flex-shrink-0 cursor-pointer items-center justify-center"
                  >
                    <input
                      id="terms-checkbox-invite"
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={() => setAgreedToTerms(!agreedToTerms)}
                      className="sr-only"
                      aria-label="I agree to the Terms of Service and Privacy Policy"
                    />
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-all ${
                        agreedToTerms
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {agreedToTerms ? <Check className="h-4 w-4 text-white" /> : null}
                    </span>
                  </label>
                  <label
                    htmlFor="terms-checkbox-invite"
                    className="cursor-pointer select-none pt-2.5 text-sm leading-relaxed text-gray-600"
                  >
                    I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline" onClick={(e) => e.stopPropagation()}>
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline" onClick={(e) => e.stopPropagation()}>
                      Privacy Policy
                    </a>
                  </label>
                </div>
                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                    <div className="text-sm text-red-600">
                      <p>{error}</p>
                      {(error.toLowerCase().includes('already exists') || error.toLowerCase().includes('log in')) && (
                        <Link
                          href="/patient-login"
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Go to login
                        </Link>
                      )}
                    </div>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || !isPasswordValid || !passwordsMatch || !agreedToTerms}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 font-semibold text-white transition-all hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      Create account
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: Full registration form (clinic code flow, no invite) */}
            {step === 'details' && clinic && !inviteToken && (
              <form onSubmit={handleRegistrationSubmit} className="space-y-5">
                {/* Clinic Display */}
                <div className="mb-2 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                  <div className="flex items-center gap-3">
                        {clinic.logoUrl ? (
                          <img
                            src={clinic.logoUrl}
                            alt={clinic.name}
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                            <Building2 className="h-5 w-5 text-emerald-600" />
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium text-emerald-600">Registering with</p>
                          <p className="font-semibold text-gray-900">{clinic.name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleBack}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Change
                      </button>
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="firstName"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      First Name
                    </label>
                    <div className="relative">
                      <User className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${firstName ? 'opacity-0' : 'opacity-100'}`} />
                      <input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={inviteToken ? undefined : (e) => setFirstName(e.target.value)}
                        readOnly={!!inviteToken}
                        className={`w-full rounded-xl border border-gray-200 py-2.5 pl-12 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inviteToken ? 'cursor-not-allowed bg-gray-100' : 'bg-white'}`}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="lastName"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={inviteToken ? undefined : (e) => setLastName(e.target.value)}
                      readOnly={!!inviteToken}
                      className={`w-full rounded-xl border border-gray-200 px-4 py-2.5 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inviteToken ? 'cursor-not-allowed bg-gray-100' : 'bg-white'}`}
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${email ? 'opacity-0' : 'opacity-100'}`} />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={inviteToken ? undefined : (e) => setEmail(e.target.value)}
                      readOnly={!!inviteToken}
                      className={`w-full rounded-xl border border-gray-200 py-2.5 pl-12 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inviteToken ? 'cursor-not-allowed bg-gray-100' : 'bg-white'}`}
                      required
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${phone ? 'opacity-0' : 'opacity-100'}`} />
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={inviteToken ? undefined : handlePhoneChange}
                      placeholder="(555) 555-5555"
                      readOnly={!!inviteToken}
                      className={`w-full rounded-xl border border-gray-200 py-2.5 pl-12 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inviteToken ? 'cursor-not-allowed bg-gray-100' : 'bg-white'}`}
                      required
                    />
                  </div>
                </div>

                {/* Date of Birth */}
                <div>
                  <label htmlFor="dob" className="mb-1 block text-sm font-medium text-gray-700">
                    Date of Birth
                  </label>
                  <div className="relative">
                    <Calendar className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${dob ? 'opacity-0' : 'opacity-100'}`} />
                    <input
                      id="dob"
                      type="date"
                      value={dob}
                      onChange={inviteToken ? undefined : (e) => setDob(e.target.value)}
                      readOnly={!!inviteToken}
                      className={`w-full rounded-xl border border-gray-200 py-2.5 pl-12 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 ${inviteToken ? 'cursor-not-allowed bg-gray-100' : 'bg-white'}`}
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${password ? 'opacity-0' : 'opacity-100'}`} />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-12 pr-12 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  {/* Password Requirements */}
                  {password && (
                    <div className="mt-2 space-y-1">
                      {passwordRequirements.map((req, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {req.met ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <div className="h-3.5 w-3.5 rounded-full border border-gray-300" />
                          )}
                          <span className={req.met ? 'text-emerald-600' : 'text-gray-500'}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full rounded-xl border bg-white py-2.5 pl-12 pr-12 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                        confirmPassword && !passwordsMatch ? 'border-red-300' : 'border-gray-200'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {confirmPassword && !passwordsMatch && (
                    <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                  )}
                </div>

                {/* Terms Agreement - Mobile-optimized with 44px touch targets */}
                <div className="flex items-start gap-3">
                  <label
                    htmlFor="terms-checkbox"
                    className="flex min-h-[44px] min-w-[44px] flex-shrink-0 cursor-pointer items-center justify-center"
                  >
                    <input
                      id="terms-checkbox"
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={() => setAgreedToTerms(!agreedToTerms)}
                      className="sr-only"
                      aria-label="I agree to the Terms of Service and Privacy Policy"
                    />
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-all ${
                        agreedToTerms
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {agreedToTerms && <Check className="h-4 w-4 text-white" />}
                    </span>
                  </label>
                  <label
                    htmlFor="terms-checkbox"
                    className="cursor-pointer select-none pt-2.5 text-sm leading-relaxed text-gray-600"
                  >
                    I agree to the{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </a>
                  </label>
                </div>

                {error && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                    <div className="text-sm text-red-600">
                      <p>{error}</p>
                      {(error.toLowerCase().includes('already exists') ||
                        error.toLowerCase().includes('log in')) && (
                        <Link
                          href="/patient-login"
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Go to login
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {!inviteToken && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 font-medium text-gray-700 transition-all hover:bg-gray-50"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading || !isPasswordValid || !passwordsMatch || !agreedToTerms}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 font-semibold text-white transition-all hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Success */}
            {step === 'success' && (
              <div className="space-y-6 py-4 text-center">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>

                <div>
                  <h2 className="mb-2 text-2xl font-bold text-gray-900">Check Your Email</h2>
                  <p className="text-gray-600">We've sent a verification link to</p>
                  <p className="mt-1 font-semibold text-emerald-600">{email}</p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 text-left">
                  <h3 className="mb-2 font-medium text-gray-900">Next Steps:</h3>
                  <ol className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-600">
                        1
                      </span>
                      Check your email inbox (and spam folder)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-600">
                        2
                      </span>
                      Click the verification link in the email
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-600">
                        3
                      </span>
                      Log in to access your patient portal
                    </li>
                  </ol>
                </div>

                <p className="text-xs text-gray-500">The verification link expires in 24 hours</p>

                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 font-semibold text-white transition-all hover:from-emerald-700 hover:to-teal-700"
                >
                  Go to Login
                  <ArrowRight className="h-5 w-5" />
                </Link>

                <p className="text-sm text-gray-600">
                  Didn't receive the email?{' '}
                  <button
                    type="button"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await fetch('/api/auth/register', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email, action: 'resend' }),
                        });
                        alert('Verification email resent!');
                      } catch {
                        alert('Failed to resend email. Please try again.');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                    className="font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Resend verification email
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-500">HIPAA Compliant Healthcare Platform • © 2026 EONPro</p>
        </div>
      </div>
    </div>
  );
}
