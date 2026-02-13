'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Mail, ArrowRight, RefreshCw } from 'lucide-react';
import { useState, Suspense } from 'react';

function EmailVerifiedContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const message = searchParams.get('message');

  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const isSuccess = status === 'success';
  const errorMessage = message
    ? decodeURIComponent(message)
    : 'An error occurred during verification';

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;

    setResendLoading(true);
    setResendMessage('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail, action: 'resend' }),
      });

      const data = await response.json();

      if (response.ok) {
        setResendMessage('Verification email sent! Please check your inbox.');
      } else {
        setResendMessage(data.error || 'Failed to send verification email');
      }
    } catch {
      setResendMessage('Failed to send verification email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#efece7] p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white/80 shadow-xl backdrop-blur-sm">
          <div className="p-8">
            {isSuccess ? (
              /* Success State */
              <div className="space-y-6 text-center">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>

                <div>
                  <h1 className="mb-2 text-2xl font-bold text-gray-900">Email Verified!</h1>
                  <p className="text-gray-600">
                    Your email has been successfully verified. You can now log in to your patient
                    portal.
                  </p>
                </div>

                <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p>Your account is now active. Log in to:</p>
                  <ul className="mt-2 space-y-1 text-left">
                    <li>• View your health records</li>
                    <li>• Schedule appointments</li>
                    <li>• Message your care team</li>
                    <li>• Track your orders</li>
                  </ul>
                </div>

                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 font-semibold text-white transition-all hover:from-emerald-700 hover:to-teal-700"
                >
                  Log In to Patient Portal
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            ) : (
              /* Error State */
              <div className="space-y-6 text-center">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
                  <XCircle className="h-10 w-10 text-red-600" />
                </div>

                <div>
                  <h1 className="mb-2 text-2xl font-bold text-gray-900">Verification Failed</h1>
                  <p className="text-gray-600">{errorMessage}</p>
                  {(errorMessage.includes('already been used') ||
                    errorMessage.includes('Too many attempts')) && (
                    <p className="mt-3 font-medium text-emerald-700">
                      If you already verified your email, try logging in.
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-gray-50 p-4 text-left">
                  <p className="mb-3 text-sm font-medium text-gray-700">
                    Common reasons for verification failure:
                  </p>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400">•</span>
                      The verification link has expired (links are valid for 24 hours)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400">•</span>
                      The link has already been used
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400">•</span>
                      The link was copied incorrectly
                    </li>
                  </ul>
                </div>

                {/* Resend Verification Form */}
                <div className="border-t border-gray-100 pt-6">
                  <p className="mb-4 text-sm text-gray-600">
                    Need a new verification link? Enter your email below:
                  </p>
                  <form onSubmit={handleResendVerification} className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="Enter your email"
                        className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </div>

                    {resendMessage && (
                      <p
                        className={`text-sm ${resendMessage.includes('sent') ? 'text-emerald-600' : 'text-red-600'}`}
                      >
                        {resendMessage}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={resendLoading || !resendEmail}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white transition-all hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resendLoading ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          Resend Verification Email
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div className="flex items-center justify-center gap-4 text-sm">
                  <Link
                    href="/login"
                    className="font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Back to Login
                  </Link>
                  <span className="text-gray-300">|</span>
                  <Link
                    href="/register"
                    className="font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Create New Account
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-500">HIPAA Compliant Healthcare Platform</p>
        </div>
      </div>
    </div>
  );
}

export default function EmailVerifiedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <EmailVerifiedContent />
    </Suspense>
  );
}
