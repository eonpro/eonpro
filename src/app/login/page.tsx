'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, X, Mail, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [sessionMessage, setSessionMessage] = useState('');

  // Check for session expired message
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      setSessionMessage('Your session has expired. Please log in again.');
    } else if (reason === 'no_session') {
      setSessionMessage('Please log in to continue.');
    }
  }, [searchParams]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && email.includes('@')) {
      setStep('password');
      setError('');
    } else {
      setError('Please enter a valid email address');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store tokens and user data
      localStorage.setItem('auth-token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Store role-specific tokens
      const userRole = data.user.role?.toLowerCase();
      if (userRole === 'super_admin') {
        localStorage.setItem('super_admin-token', data.token);
      } else if (userRole === 'admin') {
        localStorage.setItem('admin-token', data.token);
      } else if (userRole === 'provider') {
        localStorage.setItem('provider-token', data.token);
      }

      // Check for redirect parameter first
      const redirectTo = searchParams.get('redirect');
      if (redirectTo) {
        router.push(redirectTo);
        return;
      }

      // Otherwise redirect based on role
      const role = data.user.role?.toLowerCase();
      switch (role) {
        case 'super_admin':
          router.push('/super-admin/clinics');
          break;
        case 'admin':
          router.push('/admin');
          break;
        case 'provider':
          router.push('/provider');
          break;
        case 'staff':
          router.push('/staff');
          break;
        case 'support':
          router.push('/support');
          break;
        case 'patient':
          router.push('/patient-portal');
          break;
        case 'influencer':
          router.push('/influencer/dashboard');
          break;
        default:
          router.push('/');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setPassword('');
    setError('');
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Gradient Background - Similar to ro.co */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 25%, #d1fae5 50%, #fef9c3 75%, #fef3c7 100%)',
        }}
      />
      
      {/* Subtle mesh overlay */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 80% 20%, rgba(250, 204, 21, 0.15) 0%, transparent 50%),
                           radial-gradient(circle at 40% 80%, rgba(52, 211, 153, 0.1) 0%, transparent 50%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header with X button */}
        <div className="p-6">
          <button 
            onClick={() => router.push('/')}
            className="p-2 hover:bg-black/5 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6 text-gray-700" />
          </button>
        </div>

        {/* Logo centered at top */}
        <div className="flex justify-center pt-4 pb-8">
          <div className="flex items-center gap-2">
            <img 
              src="https://static.wixstatic.com/media/c49a9b_2e6625f0f27d44068998ab51675c6d7b~mv2.png"
              alt="EONPRO"
              className="h-10 w-10"
            />
            <span className="text-2xl font-bold text-gray-900 tracking-tight">eonpro</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center px-6 pt-8">
          {/* Welcome Text */}
          <h1 className="text-5xl md:text-6xl font-light text-gray-900 mb-4 tracking-tight">
            Welcome
          </h1>
          <p className="text-gray-600 text-lg mb-12">
            Let's get you logged in.
          </p>

          {/* Login Form */}
          <div className="w-full max-w-md">
            {step === 'email' ? (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                {/* Email Field */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                    placeholder="Email or phone number"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                {/* Session Message */}
                {sessionMessage && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <p className="text-sm text-amber-700 text-center">{sessionMessage}</p>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </div>
                )}

                {/* Continue Button */}
                <button
                  type="submit"
                  className="w-full px-6 py-4 rounded-2xl font-semibold text-white bg-gray-900 hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email Display */}
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Email or phone number</p>
                    <p className="text-gray-900 font-medium">{email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>

                {/* Password Field */}
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-4 pr-12 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                    placeholder="Password"
                    required
                    autoComplete="current-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </div>
                )}

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full px-6 py-4 rounded-2xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                    loading 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Logging in...
                    </>
                  ) : (
                    'Log in and continue'
                  )}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-gray-200"></div>
                  <span className="text-sm text-gray-500">Or other log-in options</span>
                  <div className="flex-1 h-px bg-gray-200"></div>
                </div>

                {/* Magic Link Button */}
                <button
                  type="button"
                  className="w-full px-6 py-4 rounded-2xl font-semibold text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 transition-all"
                  onClick={() => {/* TODO: Implement magic link */}}
                >
                  Email login code
                </button>

                {/* Bottom Links */}
                <div className="flex items-center justify-center gap-4 pt-4">
                  <button 
                    type="button"
                    className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2 transition-colors"
                  >
                    Forgot password?
                  </button>
                  <span className="text-gray-300">•</span>
                  <button 
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2 transition-colors"
                  >
                    Not you? Log in here
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-500">
            HIPAA Compliant Healthcare Platform • © 2024 EONPRO
          </p>
        </div>
      </div>
    </div>
  );
}
