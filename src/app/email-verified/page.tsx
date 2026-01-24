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
  const errorMessage = message ? decodeURIComponent(message) : 'An error occurred during verification';
  
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
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8">
            {isSuccess ? (
              /* Success State */
              <div className="text-center space-y-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 rounded-full">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h1>
                  <p className="text-gray-600">
                    Your email has been successfully verified. You can now log in to your patient portal.
                  </p>
                </div>
                
                <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-800">
                  <p>Your account is now active. Log in to:</p>
                  <ul className="mt-2 text-left space-y-1">
                    <li>• View your health records</li>
                    <li>• Schedule appointments</li>
                    <li>• Message your care team</li>
                    <li>• Track your orders</li>
                  </ul>
                </div>
                
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all"
                >
                  Log In to Patient Portal
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            ) : (
              /* Error State */
              <div className="text-center space-y-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full">
                  <XCircle className="h-10 w-10 text-red-600" />
                </div>
                
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Failed</h1>
                  <p className="text-gray-600">{errorMessage}</p>
                </div>
                
                <div className="bg-gray-50 rounded-xl p-4 text-left">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    Common reasons for verification failure:
                  </p>
                  <ul className="text-sm text-gray-600 space-y-2">
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
                  <p className="text-sm text-gray-600 mb-4">
                    Need a new verification link? Enter your email below:
                  </p>
                  <form onSubmit={handleResendVerification} className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="email"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="Enter your email"
                        className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                        required
                      />
                    </div>
                    
                    {resendMessage && (
                      <p className={`text-sm ${resendMessage.includes('sent') ? 'text-emerald-600' : 'text-red-600'}`}>
                        {resendMessage}
                      </p>
                    )}
                    
                    <button
                      type="submit"
                      disabled={resendLoading || !resendEmail}
                      className="w-full py-3 px-4 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {resendLoading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
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
                  <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">
                    Back to Login
                  </Link>
                  <span className="text-gray-300">|</span>
                  <Link href="/register" className="text-emerald-600 hover:text-emerald-700 font-medium">
                    Create New Account
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-500">
            HIPAA Compliant Healthcare Platform
          </p>
        </div>
      </div>
    </div>
  );
}

export default function EmailVerifiedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent" />
      </div>
    }>
      <EmailVerifiedContent />
    </Suspense>
  );
}
