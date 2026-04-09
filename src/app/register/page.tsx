'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isBrowser } from '@/lib/utils/ssr-safe';
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
import { EONPRO_LOGO_DARK } from '@/lib/constants/brand-assets';

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [16, 185, 129];
}

function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const lighten = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return `#${[lighten(r), lighten(g), lighten(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const darken = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return `#${[darken(r), darken(g), darken(b)].map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

const PRIMARY = '#10B981';
const [pcR, pcG, pcB] = hexToRgb(PRIMARY);
const darkAccent = lightenHex(PRIMARY, 0.4);
const darkButtonGradient = `linear-gradient(135deg, ${darkenHex(PRIMARY, 0.25)} 0%, ${PRIMARY} 50%, ${lightenHex(PRIMARY, 0.3)} 100%)`;
const loginGlowVars: Record<string, string> = {
  '--login-glow': `rgba(${pcR},${pcG},${pcB},0.10)`,
  '--login-glow-alt': `rgba(${pcR},${pcG},${pcB},0.06)`,
  '--login-focus': `rgba(${pcR},${pcG},${pcB},0.5)`,
  '--login-focus-ring': `rgba(${pcR},${pcG},${pcB},0.25)`,
};

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
  // Synchronous init: only show validating spinner when URL actually has an invite token.
  // Previously inviteValidating=true on every load caused CLS (spinner → form shift).
  const [inviteValidating, setInviteValidating] = useState(() => {
    if (!isBrowser) return false;
    try {
      const invite = new URLSearchParams(window.location.search).get('invite');
      return !!invite && invite.length >= 32;
    } catch {
      return false;
    }
  });
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
              : ''
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
                      : '';
                  })()
                : ''
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

  const passwordRequirements = useMemo(() => [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ], [password]);

  const isPasswordValid = passwordRequirements.every((req) => req.met);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    let formatted: string;
    if (digits.length <= 3) formatted = digits;
    else if (digits.length <= 6) formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    else formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    setPhone(formatted);
  }, []);

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
    } catch (err: unknown) {
      setError((err as any).message || 'Failed to validate clinic code');
    } finally {
      setLoading(false);
    }
  };

  // Submit registration
  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    if (!isPasswordValid) {
      const unmet = passwordRequirements.filter((r) => !r.met).map((r) => r.label);
      setError(`Password requirements not met: ${unmet.join(', ')}.`);
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const strippedPhone = phone.replace(/\D/g, '');
      const body: Record<string, string> = {
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: strippedPhone,
        dob,
      };
      if (inviteToken) {
        body.inviteToken = inviteToken;
        if (!strippedPhone) delete body.phone;
        if (!dob) delete body.dob;
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
        let errorMessage = data.error || 'Registration failed';
        if (
          errorMessage === 'Invalid input' &&
          Array.isArray(data.details) &&
          data.details.length > 0
        ) {
          errorMessage = data.details
            .map((d: { path?: string[]; message?: string }) => d.message || 'Unknown error')
            .join('. ');
        }
        throw new Error(errorMessage);
      }

      // Invite-based signups are auto-verified, redirect to login immediately
      if (inviteToken) {
        router.push('/patient-login?registered=true');
        return;
      }

      setStep('success');
    } catch (err: unknown) {
      setError((err as any).message || 'Registration failed. Please try again.');
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

  useEffect(() => {
    if (!isBrowser) return;
    const darkBg = '#020617';
    const prevBodyBg = document.body.style.backgroundColor;
    document.body.style.backgroundColor = darkBg;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const prevThemeColor = meta?.content;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = darkBg;
    return () => {
      document.body.style.backgroundColor = prevBodyBg;
      if (meta && prevThemeColor !== undefined) meta.content = prevThemeColor;
    };
  }, []);

  if (inviteValidating) {
    return (
      <div className="dark-login-bg flex min-h-[100dvh] items-center justify-center p-4" style={loginGlowVars as React.CSSProperties}>
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
          <p className="mt-4 text-white/50">Validating your invite link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark-login-bg flex min-h-[100dvh] flex-col items-center justify-center p-4" style={loginGlowVars as React.CSSProperties}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src={EONPRO_LOGO_DARK} alt="EONPRO" className="mx-auto mb-4 h-10 w-auto" width={160} height={40} style={{ maxHeight: 40, width: 'auto' }} />
          <h1 className="text-2xl font-bold text-white">Create Your Account</h1>
          <p className="mt-1 text-white/70">Patient Registration</p>
        </div>

        {/* Progress Indicator */}
        {step !== 'success' && (
          <div className="mb-8 flex items-center justify-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                step === 'clinic' ? 'text-white' : 'text-white'
              }`}
              style={{ background: darkButtonGradient }}
            >
              {step !== 'clinic' ? <Check className="h-4 w-4" /> : '1'}
            </div>
            <div
              className={`h-1 w-12 rounded ${step === 'details' ? '' : 'bg-white/15'}`}
              style={step === 'details' ? { background: darkButtonGradient } : undefined}
            />
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                step === 'details' ? 'text-white' : 'bg-white/10 text-white/50'
              }`}
              style={step === 'details' ? { background: darkButtonGradient } : undefined}
            >
              2
            </div>
          </div>
        )}

        <div>
          <div>
            {/* STEP 1: Clinic Code */}
            {step === 'clinic' && (
              <form onSubmit={handleClinicCodeSubmit} className="space-y-6">
                <div className="mb-6 text-center">
                  <Building2 className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white">Enter Clinic Code</h2>
                  <p className="mt-1 text-sm text-white/70">
                    Enter the registration code provided by your healthcare clinic
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="clinicCode"
                    className="mb-2 block text-sm font-medium text-white/70"
                  >
                    Clinic Code
                  </label>
                  <input
                    id="clinicCode"
                    type="text"
                    value={clinicCode}
                    onChange={(e) => setClinicCode(e.target.value.toUpperCase())}
                    placeholder="e.g., CLINIC123"
                    className="w-full rounded-xl border border-white/12 bg-white/[0.06] px-4 py-3 font-mono text-lg uppercase tracking-wider transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    autoFocus
                    required
                  />
                </div>

                <div
                  className={`flex items-start gap-3 rounded-xl border transition-all duration-150 ${
                    error ? 'border-red-500/30 bg-red-900/30 backdrop-blur-sm p-4 opacity-100' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {error && <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />}
                  {error && <p className="text-sm text-red-400">{error}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading || !clinicCode.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: darkButtonGradient }}
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

                <div className="border-t border-white/10 pt-4 text-center">
                  <p className="text-sm text-white/60">
                    Already have an account?{' '}
                    <Link
                      href="/login"
                      className="font-medium text-emerald-400 hover:text-emerald-300"
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
                  <p className="text-sm font-medium text-emerald-400">Invited by</p>
                  {clinic.logoUrl ? (
                    <img
                      src={clinic.logoUrl}
                      alt={clinic.name}
                      className="mx-auto mt-2 h-14 max-w-[200px] object-contain object-center"
                      width={200}
                      height={56}
                    />
                  ) : (
                    <p className="mt-2 font-semibold text-white">{clinic.name}</p>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.06] backdrop-blur-sm px-4 py-3 text-center">
                  <p className="text-sm text-white/70">
                    Create your password for <strong className="text-white">{firstName} {lastName}</strong>
                  </p>
                  <p className="mt-1 text-xs text-white/50">{email}</p>
                </div>
                {/* Password */}
                <div>
                  <label
                    htmlFor="password-invite"
                    className="mb-1 block text-sm font-medium text-white/70"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                    <input
                      id="password-invite"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-white/12 bg-white/[0.06] py-2.5 pl-12 pr-12 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <div className="mt-2 min-h-[110px] space-y-1">
                    {password ? passwordRequirements.map((req, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {req.met ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-white/30" />
                        )}
                        <span className={req.met ? 'text-emerald-400' : 'text-white/50'}>
                          {req.label}
                        </span>
                      </div>
                    )) : (
                      <p className="text-xs text-white/40">Must be at least 12 characters with uppercase, lowercase, number, and special character</p>
                    )}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="confirmPassword-invite"
                    className="mb-1 block text-sm font-medium text-white/70"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                    <input
                      id="confirmPassword-invite"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full rounded-xl border bg-white/[0.06] py-2.5 pl-12 pr-12 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                        confirmPassword && !passwordsMatch ? 'border-red-300' : 'border-white/12'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className={`mt-1 text-xs text-red-500 transition-opacity duration-150 ${confirmPassword && !passwordsMatch ? 'opacity-100' : 'pointer-events-none h-0 overflow-hidden opacity-0'}`}>
                    Passwords do not match
                  </p>
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
                      className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${
                        agreedToTerms
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-white/30 bg-white/[0.06]'
                      }`}
                    >
                      {agreedToTerms ? <Check className="h-4 w-4 text-white" /> : null}
                    </span>
                  </label>
                  <label
                    htmlFor="terms-checkbox-invite"
                    className="cursor-pointer select-none pt-2.5 text-sm leading-relaxed text-white/70"
                  >
                    I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline" onClick={(e) => e.stopPropagation()}>
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline" onClick={(e) => e.stopPropagation()}>
                      Privacy Policy
                    </a>
                  </label>
                </div>
                <div
                  className={`flex items-start gap-3 rounded-xl border transition-all duration-150 ${
                    error ? 'border-red-500/30 bg-red-900/30 backdrop-blur-sm p-4 opacity-100' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {error && (
                    <>
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                      <div className="text-sm text-red-400">
                        <p>{error}</p>
                        {(error.toLowerCase().includes('already exists') || error.toLowerCase().includes('log in')) && (
                          <Link
                            href="/patient-login"
                            className="mt-2 inline-flex items-center gap-1 font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                            Go to login
                          </Link>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: darkButtonGradient }}
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
                <div className="mb-2 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-3">
                  <div className="flex items-center gap-3">
                        {clinic.logoUrl ? (
                          <img
                            src={clinic.logoUrl}
                            alt={clinic.name}
                            className="h-10 w-10 rounded-lg object-cover"
                            width={40}
                            height={40}
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                            <Building2 className="h-5 w-5 text-emerald-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium text-emerald-400">Registering with</p>
                          <p className="font-semibold text-white">{clinic.name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleBack}
                        className="text-sm text-white/50 hover:text-white/70"
                      >
                        Change
                      </button>
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="firstName"
                      className="mb-1 block text-sm font-medium text-white/70"
                    >
                      First Name
                    </label>
                    <div className="relative">
                      <User className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40 transition-opacity duration-200 ${firstName ? 'opacity-0' : 'opacity-100'}`} />
                      <input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={inviteToken ? undefined : (e) => setFirstName(e.target.value)}
                        readOnly={!!inviteToken}
                        className={`w-full rounded-xl border border-white/12 py-2.5 pl-12 pr-4 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${inviteToken ? 'cursor-not-allowed bg-white/[0.03]' : 'bg-white'}`}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="lastName"
                      className="mb-1 block text-sm font-medium text-white/70"
                    >
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={inviteToken ? undefined : (e) => setLastName(e.target.value)}
                      readOnly={!!inviteToken}
                      className={`w-full rounded-xl border border-white/12 px-4 py-2.5 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${inviteToken ? 'cursor-not-allowed bg-white/[0.03]' : 'bg-white'}`}
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-medium text-white/70">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40 transition-opacity duration-200 ${email ? 'opacity-0' : 'opacity-100'}`} />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={inviteToken ? undefined : (e) => setEmail(e.target.value)}
                      readOnly={!!inviteToken}
                      className={`w-full rounded-xl border border-white/12 py-2.5 pl-12 pr-4 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${inviteToken ? 'cursor-not-allowed bg-white/[0.03]' : 'bg-white'}`}
                      required
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="mb-1 block text-sm font-medium text-white/70">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40 transition-opacity duration-200 ${phone ? 'opacity-0' : 'opacity-100'}`} />
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={inviteToken ? undefined : handlePhoneChange}
                      placeholder="(555) 555-5555"
                      readOnly={!!inviteToken}
                      className={`w-full rounded-xl border border-white/12 py-2.5 pl-12 pr-4 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${inviteToken ? 'cursor-not-allowed bg-white/[0.03]' : 'bg-white'}`}
                      required
                    />
                  </div>
                </div>

                {/* Date of Birth */}
                <div>
                  <label htmlFor="dob" className="mb-1 block text-sm font-medium text-white/70">
                    Date of Birth
                  </label>
                  <div className="relative">
                    <Calendar className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40 transition-opacity duration-200 ${dob ? 'opacity-0' : 'opacity-100'}`} />
                    <input
                      id="dob"
                      type="date"
                      value={dob}
                      onChange={inviteToken ? undefined : (e) => setDob(e.target.value)}
                      readOnly={!!inviteToken}
                      className={`w-full rounded-xl border border-white/12 py-2.5 pl-12 pr-4 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${inviteToken ? 'cursor-not-allowed bg-white/[0.03]' : 'bg-white'}`}
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1 block text-sm font-medium text-white/70"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40 transition-opacity duration-200 ${password ? 'opacity-0' : 'opacity-100'}`} />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-white/12 bg-white/[0.06] py-2.5 pl-12 pr-12 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  {/* Password Requirements — fixed height to prevent CLS */}
                  <div className="mt-2 min-h-[110px] space-y-1">
                    {password ? passwordRequirements.map((req, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {req.met ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-white/30" />
                        )}
                        <span className={req.met ? 'text-emerald-400' : 'text-white/50'}>
                          {req.label}
                        </span>
                      </div>
                    )) : (
                      <p className="text-xs text-white/40">Must be at least 12 characters with uppercase, lowercase, number, and special character</p>
                    )}
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1 block text-sm font-medium text-white/70"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full rounded-xl border bg-white/[0.06] py-2.5 pl-12 pr-12 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                        confirmPassword && !passwordsMatch ? 'border-red-300' : 'border-white/12'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  <p className={`mt-1 text-xs text-red-500 transition-opacity duration-150 ${confirmPassword && !passwordsMatch ? 'opacity-100' : 'pointer-events-none h-0 overflow-hidden opacity-0'}`}>
                    Passwords do not match
                  </p>
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
                      className={`flex h-6 w-6 items-center justify-center rounded border-2 transition-colors ${
                        agreedToTerms
                          ? 'border-emerald-600 bg-emerald-600'
                          : 'border-white/30 bg-white/[0.06]'
                      }`}
                    >
                      {agreedToTerms && <Check className="h-4 w-4 text-white" />}
                    </span>
                  </label>
                  <label
                    htmlFor="terms-checkbox"
                    className="cursor-pointer select-none pt-2.5 text-sm leading-relaxed text-white/70"
                  >
                    I agree to the{' '}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </a>
                  </label>
                </div>

                <div
                  className={`flex items-start gap-3 rounded-xl border transition-all duration-150 ${
                    error ? 'border-red-500/30 bg-red-900/30 backdrop-blur-sm p-4 opacity-100' : 'h-0 overflow-hidden border-transparent p-0 opacity-0'
                  }`}
                  aria-live="polite"
                >
                  {error && (
                    <>
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                      <div className="text-sm text-red-400">
                        <p>{error}</p>
                        {(error.toLowerCase().includes('already exists') ||
                          error.toLowerCase().includes('log in')) && (
                          <Link
                            href="/patient-login"
                            className="mt-2 inline-flex items-center gap-1 font-semibold text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                          >
                            <ArrowRight className="h-3.5 w-3.5" />
                            Go to login
                          </Link>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  {!inviteToken && (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 font-medium text-white/70 backdrop-blur-sm transition-colors hover:bg-white/[0.1]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: darkButtonGradient }}
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
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.06]">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                </div>

                <div>
                  <h2 className="mb-2 text-2xl font-bold text-white">Check Your Email</h2>
                  <p className="text-white/70">We've sent a verification link to</p>
                  <p className="mt-1 font-semibold text-emerald-400">{email}</p>
                </div>

                <div className="rounded-xl bg-white/[0.06] backdrop-blur-sm border border-white/10 p-4 text-left">
                  <h3 className="mb-2 font-medium text-white">Next Steps:</h3>
                  <ol className="space-y-2 text-sm text-white/70">
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-emerald-400">
                        1
                      </span>
                      Check your email inbox (and spam folder)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-emerald-400">
                        2
                      </span>
                      Click the verification link in the email
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-emerald-400">
                        3
                      </span>
                      Log in to access your patient portal
                    </li>
                  </ol>
                </div>

                <p className="text-xs text-white/50">The verification link expires in 24 hours</p>

                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: darkButtonGradient }}
                >
                  Go to Login
                  <ArrowRight className="h-5 w-5" />
                </Link>

                <p className="text-sm text-white/70">
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
                    className="font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    Resend verification email
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 p-6 text-center">
          <div className="mb-3 flex items-center justify-center gap-6 text-white/35">
            <span className="flex items-center gap-1.5 text-xs">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Encrypted
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              HIPAA Compliant
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              SOC 2
            </span>
          </div>
          <p className="text-xs text-white/30">
            eonpro.io &nbsp;•&nbsp; © All Rights Reserved 2026 EONPro
          </p>
        </div>
      </div>
    </div>
  );
}
