'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, X, Mail, Phone, ArrowRight, RefreshCw, Building2, Check } from 'lucide-react';

type LoginStep = 'identifier' | 'password' | 'otp' | 'clinic';
type LoginMethod = 'email' | 'phone';

interface Clinic {
  id: number;
  name: string;
  subdomain: string | null;
  logoUrl: string | null;
  role: string;
  isPrimary: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Form state
  const [identifier, setIdentifier] = useState(''); // email or phone
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [showPassword, setShowPassword] = useState(false);
  
  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<LoginStep>('identifier');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [sessionMessage, setSessionMessage] = useState('');
  
  // OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [canResend, setCanResend] = useState(false);
  
  // Multi-clinic state
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [pendingLoginData, setPendingLoginData] = useState<any>(null);
  
  // OTP input refs
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Check for session expired message
  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_expired') {
      setSessionMessage('Your session has expired. Please log in again.');
    } else if (reason === 'no_session') {
      setSessionMessage('Please log in to continue.');
    }
  }, [searchParams]);

  // OTP countdown timer
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (otpSent && otpCountdown === 0) {
      setCanResend(true);
    }
  }, [otpCountdown, otpSent]);

  // Detect if input is phone number or email
  const isPhoneNumber = (value: string): boolean => {
    // Remove all non-digit characters for checking
    const digitsOnly = value.replace(/\D/g, '');
    // If it's 10+ digits and doesn't contain @, it's likely a phone number
    return digitsOnly.length >= 10 && !value.includes('@');
  };

  // Format phone for display
  const formatPhoneDisplay = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  };

  // Handle identifier submission (step 1)
  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const trimmedIdentifier = identifier.trim();
    
    if (!trimmedIdentifier) {
      setError('Please enter your email or phone number');
      return;
    }
    
    // Detect login method
    if (isPhoneNumber(trimmedIdentifier)) {
      setLoginMethod('phone');
      // Send OTP
      await sendOtp(trimmedIdentifier);
    } else if (trimmedIdentifier.includes('@')) {
      setLoginMethod('email');
      setStep('password');
    } else {
      setError('Please enter a valid email address or phone number');
    }
  };

  // Send OTP to phone
  const sendOtp = async (phone: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send verification code');
      }
      
      setOtpSent(true);
      setOtpCountdown(60); // 60 second cooldown
      setCanResend(false);
      setStep('otp');
      
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (!canResend) return;
    setOtp(['', '', '', '', '', '']);
    await sendOtp(identifier);
  };

  // Handle OTP input change
  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    
    // Auto-focus next input
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    
    // Auto-submit when all digits entered
    if (digit && index === 5 && newOtp.every(d => d)) {
      verifyOtp(newOtp.join(''));
    }
  };

  // Handle OTP paste
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    
    if (pastedData.length === 6) {
      const newOtp = pastedData.split('');
      setOtp(newOtp);
      otpRefs.current[5]?.focus();
      verifyOtp(pastedData);
    }
  };

  // Handle OTP backspace
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Verify OTP
  const verifyOtp = async (code: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: identifier, code }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Invalid verification code');
      }
      
      // Success - store tokens and redirect
      handleLoginSuccess(data);
      
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Handle email/password login
  const handlePasswordLogin = async (e: React.FormEvent, clinicId?: number) => {
    e?.preventDefault?.();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: identifier, 
          password,
          clinicId: clinicId || selectedClinicId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Check if user needs to select a clinic
      if (data.requiresClinicSelection && data.clinics?.length > 1) {
        setClinics(data.clinics);
        setPendingLoginData(data);
        setStep('clinic');
        return;
      }

      handleLoginSuccess(data);
      
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  // Handle clinic selection and complete login
  const handleClinicSelect = async (clinicId: number) => {
    setSelectedClinicId(clinicId);
    setLoading(true);
    setError('');

    try {
      // Re-authenticate with selected clinic
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: identifier, 
          password,
          clinicId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      handleLoginSuccess(data);
      
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  // Handle successful login
  const handleLoginSuccess = (data: any) => {
    // Debug: Log what we received
    console.log('[LOGIN] handleLoginSuccess called with data:', {
      hasToken: !!data.token,
      tokenLength: data.token?.length,
      user: data.user?.email,
      role: data.user?.role,
      clinics: data.clinics?.length,
    });

    if (!data.token) {
      console.error('[LOGIN] No token in response data!');
      setError('Login failed: No authentication token received');
      return;
    }

    // Store tokens and user data (both keys for compatibility)
    localStorage.setItem('auth-token', data.token);
    localStorage.setItem('token', data.token); // Legacy key for compatibility
    localStorage.setItem('user', JSON.stringify(data.user));

    // Store clinic information for multi-clinic support
    if (data.clinics) {
      localStorage.setItem('clinics', JSON.stringify(data.clinics));
      localStorage.setItem('activeClinicId', String(data.activeClinicId || data.clinics[0]?.id));
    }

    // Verify tokens were stored
    const storedToken = localStorage.getItem('auth-token');
    console.log('[LOGIN] Token stored successfully:', !!storedToken, 'length:', storedToken?.length);

    // Store role-specific tokens
    const userRole = data.user.role?.toLowerCase();
    if (userRole === 'super_admin') {
      localStorage.setItem('super_admin-token', data.token);
    } else if (userRole === 'admin') {
      localStorage.setItem('admin-token', data.token);
    } else if (userRole === 'provider') {
      localStorage.setItem('provider-token', data.token);
    } else if (userRole === 'staff') {
      localStorage.setItem('staff-token', data.token);
    }

    // Check for redirect parameter first
    const redirectTo = searchParams.get('redirect');
    if (redirectTo) {
      router.push(redirectTo);
      return;
    }

    // Otherwise redirect based on role
    switch (userRole) {
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
  };

  // Go back to identifier step
  const handleBack = () => {
    setStep('identifier');
    setPassword('');
    setOtp(['', '', '', '', '', '']);
    setError('');
    setOtpSent(false);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Gradient Background */}
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
          <img 
            src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
            alt="EONPRO"
            className="h-10 w-auto"
          />
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
            
            {/* STEP 1: Email or Phone Input */}
            {step === 'identifier' && (
              <form onSubmit={handleIdentifierSubmit} className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    {isPhoneNumber(identifier) ? (
                      <Phone className="h-5 w-5" />
                    ) : (
                      <Mail className="h-5 w-5" />
                    )}
                  </div>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                    placeholder="Email or phone number"
                    required
                    autoComplete="username"
                    autoFocus
                  />
                </div>

                {sessionMessage && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <p className="text-sm text-amber-700 text-center">{sessionMessage}</p>
                  </div>
                )}

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full px-6 py-4 rounded-2xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                    loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                      {isPhoneNumber(identifier) ? 'Sending code...' : 'Continue'}
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2a: Password (for email login) */}
            {step === 'password' && (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                {/* Email Display */}
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Email</p>
                    <p className="text-gray-900 font-medium">{identifier}</p>
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

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full px-6 py-4 rounded-2xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                    loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                      Logging in...
                    </>
                  ) : (
                    'Log in and continue'
                  )}
                </button>

                <div className="flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-sm text-gray-500">Or other log-in options</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <button
                  type="button"
                  className="w-full px-6 py-4 rounded-2xl font-semibold text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 transition-all"
                  onClick={() => {/* TODO: Implement magic link */}}
                >
                  Email login code
                </button>

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

            {/* STEP 2b: OTP (for phone login) */}
            {step === 'otp' && (
              <div className="space-y-6">
                {/* Phone Display */}
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Phone number</p>
                    <p className="text-gray-900 font-medium">{formatPhoneDisplay(identifier)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                  >
                    Edit
                  </button>
                </div>

                {/* OTP Instructions */}
                <div className="text-center">
                  <p className="text-gray-600">
                    Enter the 6-digit code sent to your phone
                  </p>
                </div>

                {/* OTP Input */}
                <div className="flex justify-center gap-3">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      className="w-12 h-14 text-center text-2xl font-semibold bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </div>
                )}

                {loading && (
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
                  </div>
                )}

                {/* Resend OTP */}
                <div className="text-center">
                  {canResend ? (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      className="inline-flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Resend code
                    </button>
                  ) : otpCountdown > 0 ? (
                    <p className="text-gray-500 text-sm">
                      Resend code in {otpCountdown}s
                    </p>
                  ) : null}
                </div>

                {/* Bottom Links */}
                <div className="flex items-center justify-center gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2 transition-colors"
                  >
                    Use a different number
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Clinic Selection (for multi-clinic users) */}
            {step === 'clinic' && (
              <div className="space-y-6">
                {/* User Display */}
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Logged in as</p>
                    <p className="text-gray-900 font-medium">{identifier}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                  >
                    Change
                  </button>
                </div>

                {/* Clinic Selection Instructions */}
                <div className="text-center">
                  <Building2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Select a Clinic
                  </h2>
                  <p className="text-gray-600">
                    You have access to multiple clinics. Choose which one to access now.
                  </p>
                </div>

                {/* Clinic List */}
                <div className="space-y-3">
                  {clinics.map((clinic) => (
                    <button
                      key={clinic.id}
                      onClick={() => handleClinicSelect(clinic.id)}
                      disabled={loading}
                      className={`w-full p-4 text-left rounded-2xl border-2 transition-all ${
                        selectedClinicId === clinic.id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {clinic.logoUrl ? (
                            <img 
                              src={clinic.logoUrl} 
                              alt={clinic.name}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-emerald-600" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{clinic.name}</p>
                            <p className="text-sm text-gray-500 capitalize">{clinic.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {clinic.isPrimary && (
                            <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                              Primary
                            </span>
                          )}
                          {selectedClinicId === clinic.id && (
                            <Check className="h-5 w-5 text-emerald-600" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </div>
                )}

                {loading && (
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
                  </div>
                )}

                <p className="text-xs text-center text-gray-500">
                  You can switch clinics anytime from your dashboard
                </p>
              </div>
            )}
            
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center">
          <p className="text-xs text-gray-500">
            HIPAA Compliant Healthcare Platform • © 2026 EONPRO
          </p>
        </div>
      </div>
    </div>
  );
}
