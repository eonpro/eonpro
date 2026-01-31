'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, X, Mail, Phone, ArrowRight, RefreshCw, Building2, Check } from 'lucide-react';
import { isBrowser } from '@/lib/utils/ssr-safe';

type LoginStep = 'identifier' | 'password' | 'otp' | 'clinic' | 'forgot' | 'reset';
type LoginMethod = 'email' | 'phone';

interface Clinic {
  id: number;
  name: string;
  subdomain: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  role: string;
  isPrimary: boolean;
}

interface ClinicBranding {
  clinicId: number;
  name: string;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonTextColor: 'auto' | 'light' | 'dark';
}

// Helper function to calculate text color based on background luminance
function getTextColorForBg(hex: string, mode: 'auto' | 'light' | 'dark'): string {
  if (mode === 'light') return '#ffffff';
  if (mode === 'dark') return '#1f2937';

  // Auto mode: calculate based on luminance
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#ffffff';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
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

  // Forgot password state
  const [resetCode, setResetCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);
  const [canResendReset, setCanResendReset] = useState(false);
  const resetCodeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // White-label branding state
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [resolvedClinicId, setResolvedClinicId] = useState<number | null>(null);
  const [isMainApp, setIsMainApp] = useState(false);

  // OTP input refs
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resolve clinic from domain and load branding
  useEffect(() => {
    // SSR guard
    if (!isBrowser) return;

    const resolveClinic = async () => {
      try {
        const domain = window.location.hostname;
        const response = await fetch(`/api/clinic/resolve?domain=${encodeURIComponent(domain)}`);

        if (response.ok) {
          const data = await response.json();
          
          // Check if this is the main app (not a white-labeled clinic)
          if (data.isMainApp) {
            setIsMainApp(true);
            // Don't set branding for main app - use default EONPRO branding
            return;
          }
          
          setResolvedClinicId(data.clinicId);
          setBranding({
            clinicId: data.clinicId,
            name: data.name,
            logoUrl: data.branding.logoUrl,
            iconUrl: data.branding.iconUrl,
            faviconUrl: data.branding.faviconUrl,
            primaryColor: data.branding.primaryColor,
            secondaryColor: data.branding.secondaryColor,
            accentColor: data.branding.accentColor,
            buttonTextColor: data.branding.buttonTextColor || 'auto',
          });

          // Update favicon if clinic has one
          if (data.branding.faviconUrl) {
            const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement || document.createElement('link');
            link.type = 'image/x-icon';
            link.rel = 'shortcut icon';
            link.href = data.branding.faviconUrl;
            document.head.appendChild(link);
          }

          // Update page title
          document.title = `Login | ${data.name}`;
        }
      } catch (err) {
        // Silently fail - use default branding
        console.log('Using default branding');
      }
    };

    resolveClinic();
  }, []);

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
    return undefined;
  }, [otpCountdown, otpSent]);

  // Reset code countdown timer
  useEffect(() => {
    if (resetCountdown > 0) {
      const timer = setTimeout(() => setResetCountdown(resetCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resetCodeSent && resetCountdown === 0) {
      setCanResendReset(true);
    }
    return undefined;
  }, [resetCountdown, resetCodeSent]);

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

  // Handle forgot password - send reset code
  const handleForgotPassword = async () => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, role: 'patient' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset code');
      }

      setResetCodeSent(true);
      setResetCountdown(60);
      setCanResendReset(false);
      setStep('forgot');

    } catch (err: any) {
      setError(err.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  // Resend reset code
  const handleResendResetCode = async () => {
    if (!canResendReset) return;
    setResetCode(['', '', '', '', '', '']);
    await handleForgotPassword();
  };

  // Handle reset code input
  const handleResetCodeChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...resetCode];
    newCode[index] = digit;
    setResetCode(newCode);

    if (digit && index < 5) {
      resetCodeRefs.current[index + 1]?.focus();
    }

    // Move to password step when all digits entered
    if (digit && index === 5 && newCode.every(d => d)) {
      setStep('reset');
    }
  };

  // Handle reset code paste
  const handleResetCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pastedData.length === 6) {
      setResetCode(pastedData.split(''));
      resetCodeRefs.current[5]?.focus();
      setStep('reset');
    }
  };

  // Handle reset code backspace
  const handleResetCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !resetCode[index] && index > 0) {
      resetCodeRefs.current[index - 1]?.focus();
    }
  };

  // Submit new password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: identifier,
          code: resetCode.join(''),
          newPassword,
          role: 'patient',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      // Success - go back to password step with success message
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setResetCode(['', '', '', '', '', '']);
      setResetCodeSent(false);
      setStep('password');
      setError(''); // Clear any errors
      setSessionMessage('Password reset successful! Please log in with your new password.');

    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
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
          clinicId: clinicId || selectedClinicId || resolvedClinicId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle unverified email specially
        if (data.code === 'EMAIL_NOT_VERIFIED') {
          setError(`${data.error} Check your email or request a new verification link.`);
          setLoading(false);
          return;
        }
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
  const handleLoginSuccess = (data: { token?: string; user?: { email?: string; role?: string }; clinics?: Array<{ id: number }>; activeClinicId?: number }) => {
    if (!data.token) {
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

    // Store role-specific tokens
    const userRole = data.user?.role?.toLowerCase();
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

  // Get colors from branding or use defaults
  const primaryColor = branding?.primaryColor || '#10B981';
  const secondaryColor = branding?.secondaryColor || '#3B82F6';
  const accentColor = branding?.accentColor || '#d3f931';
  const buttonTextMode = branding?.buttonTextColor || 'auto';
  const buttonTextColor = getTextColorForBg(primaryColor, buttonTextMode);

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Gradient Background - uses branding colors */}
      <div
        className="absolute inset-0"
        style={{
          background: branding
            ? `linear-gradient(135deg, ${primaryColor}08 0%, ${primaryColor}12 25%, ${secondaryColor}10 50%, ${accentColor}15 75%, ${accentColor}20 100%)`
            : 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 25%, #d1fae5 50%, #fef9c3 75%, #fef3c7 100%)',
        }}
      />

      {/* Subtle mesh overlay */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: branding
            ? `radial-gradient(circle at 20% 50%, ${primaryColor}15 0%, transparent 50%),
               radial-gradient(circle at 80% 20%, ${accentColor}20 0%, transparent 50%),
               radial-gradient(circle at 40% 80%, ${secondaryColor}15 0%, transparent 50%)`
            : `radial-gradient(circle at 20% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 50%),
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

        {/* Logo centered at top - uses clinic logo if available */}
        <div className="flex flex-col items-center pt-4 pb-8">
          {branding && !isMainApp ? (
            <>
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.name}
                  className="h-12 max-w-[200px] object-contain"
                />
              ) : (
                <h1
                  className="text-3xl font-bold"
                  style={{ color: primaryColor }}
                >
                  {branding.name}
                </h1>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Powered by <span className="font-medium">EONPRO</span>
              </p>
            </>
          ) : (
            /* Main app (app.eonpro.io) - show EONPRO logo only, no "Powered by" */
            <img
              src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
              alt="EONPRO"
              className="h-10 w-auto"
            />
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center px-6 pt-8">
          {/* Welcome Text */}
          <h1 className="text-5xl md:text-6xl font-light text-gray-900 mb-4 tracking-tight">
            Welcome
          </h1>
          <p className="text-gray-600 text-lg mb-12">
            {branding && !isMainApp ? `Sign in to ${branding.name}` : "Sign in to EONPRO"}
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
                    className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
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
                  className={`w-full px-6 py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    loading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: loading ? '#9CA3AF' : primaryColor,
                    color: buttonTextColor,
                  }}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent" />
                      {isPhoneNumber(identifier) ? 'Sending code...' : 'Continue'}
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>

                {/* New Patient Registration Link */}
                <div className="pt-4">
                  <p className="text-sm text-center text-gray-600">
                    New patient?{' '}
                    <a
                      href="/register"
                      className="font-medium hover:opacity-80"
                      style={{ color: primaryColor }}
                    >
                      Create an account
                    </a>
                  </p>
                </div>
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
                    className="w-full px-4 py-4 pr-12 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
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
                  className={`w-full px-6 py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    loading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: loading ? '#9CA3AF' : primaryColor,
                    color: buttonTextColor,
                  }}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent" />
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
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2 transition-colors disabled:opacity-50"
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
                      className="w-12 h-14 text-center text-2xl font-semibold bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
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
                    <div
                      className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent"
                      style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
                    />
                  </div>
                )}

                {/* Resend OTP */}
                <div className="text-center">
                  {canResend ? (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      className="inline-flex items-center gap-2 font-medium transition-colors hover:opacity-80"
                      style={{ color: primaryColor }}
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

            {/* STEP: Forgot Password - Enter Code */}
            {step === 'forgot' && (
              <div className="space-y-6">
                {/* Email Display */}
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Reset code sent to</p>
                    <p className="text-gray-900 font-medium">{identifier}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('password');
                      setResetCode(['', '', '', '', '', '']);
                      setResetCodeSent(false);
                    }}
                    className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                {/* Instructions */}
                <div className="text-center">
                  <Mail className="h-12 w-12 mx-auto mb-4" style={{ color: primaryColor }} />
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Check your email
                  </h2>
                  <p className="text-gray-600">
                    Enter the 6-digit code we sent to reset your password
                  </p>
                </div>

                {/* Reset Code Input */}
                <div className="flex justify-center gap-3">
                  {resetCode.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { resetCodeRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleResetCodeChange(index, e.target.value)}
                      onKeyDown={(e) => handleResetCodeKeyDown(index, e)}
                      onPaste={index === 0 ? handleResetCodePaste : undefined}
                      className="w-12 h-14 text-center text-2xl font-semibold bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </div>
                )}

                {/* Resend Code */}
                <div className="text-center">
                  {canResendReset ? (
                    <button
                      type="button"
                      onClick={handleResendResetCode}
                      className="inline-flex items-center gap-2 font-medium transition-colors hover:opacity-80"
                      style={{ color: primaryColor }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Resend code
                    </button>
                  ) : resetCountdown > 0 ? (
                    <p className="text-gray-500 text-sm">
                      Resend code in {resetCountdown}s
                    </p>
                  ) : null}
                </div>

                {/* Back to login */}
                <div className="flex items-center justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('password');
                      setResetCode(['', '', '', '', '', '']);
                      setResetCodeSent(false);
                      setError('');
                    }}
                    className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2 transition-colors"
                  >
                    Back to login
                  </button>
                </div>
              </div>
            )}

            {/* STEP: Reset Password - Enter New Password */}
            {step === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-6">
                {/* Email Display */}
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-2xl">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Resetting password for</p>
                    <p className="text-gray-900 font-medium">{identifier}</p>
                  </div>
                </div>

                {/* Instructions */}
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    Create new password
                  </h2>
                  <p className="text-gray-600">
                    Enter your new password below
                  </p>
                </div>

                {/* New Password Input */}
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:border-transparent transition-all pr-12"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    placeholder="New password"
                    required
                    minLength={8}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {/* Confirm Password Input */}
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className={`w-full px-4 py-4 bg-white border rounded-2xl focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                      confirmNewPassword && newPassword !== confirmNewPassword
                        ? 'border-red-300'
                        : 'border-gray-200'
                    }`}
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                  />
                </div>

                {/* Password requirements hint */}
                <p className="text-xs text-gray-500 text-center">
                  Password must be at least 8 characters
                </p>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !newPassword || !confirmNewPassword}
                  className={`w-full px-6 py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 ${
                    loading || !newPassword || !confirmNewPassword ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                  }`}
                  style={{
                    backgroundColor: primaryColor,
                    color: buttonTextColor,
                  }}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-current border-t-transparent" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </button>

                {/* Back to code entry */}
                <div className="flex items-center justify-center pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('forgot');
                      setError('');
                    }}
                    className="text-sm text-gray-700 hover:text-gray-900 underline underline-offset-2 transition-colors"
                  >
                    Re-enter code
                  </button>
                </div>
              </form>
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
                  <Building2 className="h-12 w-12 mx-auto mb-4" style={{ color: primaryColor }} />
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
                        loading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{
                        borderColor: selectedClinicId === clinic.id ? primaryColor : '#e5e7eb',
                        backgroundColor: selectedClinicId === clinic.id ? `${primaryColor}10` : 'white',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Use iconUrl or faviconUrl for smaller icon display, fallback to logoUrl */}
                          {(clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl) ? (
                            <img
                              src={clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl || ''}
                              alt={clinic.name}
                              className="h-10 w-10 rounded-lg object-contain"
                            />
                          ) : (
                            <div
                              className="h-10 w-10 rounded-lg flex items-center justify-center"
                              style={{ backgroundColor: `${primaryColor}20` }}
                            >
                              <Building2 className="h-5 w-5" style={{ color: primaryColor }} />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{clinic.name}</p>
                            <p className="text-sm text-gray-500 capitalize">{clinic.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {clinic.isPrimary && (
                            <span
                              className="text-xs px-2 py-1 rounded-full"
                              style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                            >
                              Primary
                            </span>
                          )}
                          {selectedClinicId === clinic.id && (
                            <Check className="h-5 w-5" style={{ color: primaryColor }} />
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
                    <div
                      className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent"
                      style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
                    />
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
            HIPAA Compliant Healthcare Platform • © 2026 {branding?.name || 'EONPRO'}
          </p>
        </div>
      </div>
    </div>
  );
}
