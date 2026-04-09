'use client';

/**
 * Generic Account Setup Page
 *
 * Reached via email link: /setup-account?token=xxx
 *
 * Steps:
 * 1. Validate token → show welcome + password form
 * 2. User sets password (strength meter, confirmation)
 * 3. Success → redirect to login
 *
 * Works for all roles: admin, staff, provider, sales_rep, support, etc.
 * Affiliates are redirected to /affiliate/welcome for their richer onboarding.
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Shield,
  Loader2,
} from 'lucide-react';

interface SetupData {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    roleLabel: string;
  };
  clinic: {
    name: string;
    logoUrl: string | null;
    primaryColor: string;
  };
}

interface PasswordCheck {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_CHECKS: PasswordCheck[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /\d/.test(pw) },
  { label: 'One special character', test: (pw) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
];

function getStrengthLevel(password: string) {
  const passed = PASSWORD_CHECKS.filter((c) => c.test(password)).length;
  if (password.length === 0) return { label: '', color: '#d1d5db', percent: 0 };
  if (passed <= 2) return { label: 'Weak', color: '#ef4444', percent: 25 };
  if (passed <= 3) return { label: 'Fair', color: '#f59e0b', percent: 50 };
  if (passed <= 4) return { label: 'Good', color: '#3b82f6', percent: 75 };
  return { label: 'Strong', color: '#10b981', percent: 100 };
}

export default function SetupAccountPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<'loading' | 'form' | 'success' | 'invalid'>('loading');
  const [data, setData] = useState<SetupData | null>(null);
  const [invalidMessage, setInvalidMessage] = useState('');
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState('/login');

  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) {
      setInvalidMessage('No setup token provided. Please check your email for the invitation link.');
      setState('invalid');
      return;
    }

    const validate = async () => {
      try {
        const res = await fetch(`/api/auth/setup-account?token=${encodeURIComponent(token)}`);
        const json = await res.json();

        if (!json.valid) {
          if (json.redirectTo) {
            window.location.href = json.redirectTo;
            return;
          }
          setInvalidMessage(json.error || 'Invalid or expired link.');
          setState('invalid');
          return;
        }

        if (json.user.role === 'AFFILIATE') {
          window.location.href = `/affiliate/welcome?token=${encodeURIComponent(token)}`;
          return;
        }

        setData(json);
        setState('form');
        setTimeout(() => passwordRef.current?.focus(), 200);
      } catch {
        setInvalidMessage('Failed to validate setup link. Please try again.');
        setState('invalid');
      }
    };

    validate();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;

    if (!allChecksPassed) {
      const unmet = PASSWORD_CHECKS.filter((c) => !c.test(password)).map((c) => c.label);
      setError(`Password requirements not met: ${unmet.join(', ')}.`);
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/setup-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to set password');
      }

      setLoginUrl(json.loginUrl || '/login');
      setState('success');

      setTimeout(() => {
        window.location.href = json.loginUrl || '/login';
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const strength = getStrengthLevel(password);
  const allChecksPassed = PASSWORD_CHECKS.every((c) => c.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allChecksPassed && passwordsMatch && !submitting;

  const primaryColor = data?.clinic.primaryColor || '#111827';

  // --- Loading ---
  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
          <p className="mt-4 text-sm text-gray-500">Validating your invitation...</p>
        </div>
      </div>
    );
  }

  // --- Invalid ---
  if (state === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">Link Expired or Invalid</h2>
          <p className="mt-3 text-sm text-gray-500">{invalidMessage}</p>
          <div className="mt-8">
            <a
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --- Success ---
  if (state === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-md text-center">
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primaryColor}15` }}
          >
            <CheckCircle className="h-8 w-8" style={{ color: primaryColor }} />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">You&apos;re all set!</h2>
          <p className="mt-3 text-sm text-gray-500">
            Your password has been set successfully.
            <br />Redirecting you to the login page...
          </p>
          <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full transition-all duration-[3000ms] ease-linear"
              style={{ backgroundColor: primaryColor, width: '100%' }}
            />
          </div>
          <a
            href={loginUrl}
            className="mt-6 inline-flex items-center gap-1 text-sm font-medium hover:opacity-80"
            style={{ color: primaryColor }}
          >
            Go to login now <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  // --- Form ---
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="flex flex-col items-center pb-2 pt-12">
        {data?.clinic.logoUrl ? (
          <img
            src={data.clinic.logoUrl}
            alt={data.clinic.name}
            className="h-10 max-w-[200px] object-contain"
          />
        ) : (
          <h1 className="text-xl font-bold text-gray-900">{data?.clinic.name}</h1>
        )}
      </div>

      {/* Content */}
      <main className="flex flex-1 flex-col items-center px-6 py-8">
        <div className="w-full max-w-md">
          {/* Welcome card */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: `${primaryColor}12` }}
            >
              <Shield className="h-6 w-6" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Welcome, {data?.user.firstName}!
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Your <strong className="text-gray-700">{data?.user.roleLabel}</strong> account at{' '}
              <strong className="text-gray-700">{data?.clinic.name}</strong> is ready.
              Set a secure password to get started.
            </p>
            <div className="mt-3 inline-block rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
              {data?.user.email}
            </div>
          </div>

          {/* Password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Password */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
              <div className="relative">
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 pr-12 text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900"
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
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ backgroundColor: strength.color, width: `${strength.percent}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 pr-12 text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900"
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
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
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
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-center text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: submitting ? '#9CA3AF' : primaryColor }}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Set Password & Continue
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center">
        <p className="text-xs text-gray-400">
          Powered by <strong>EONPro</strong>
        </p>
      </footer>
    </div>
  );
}
