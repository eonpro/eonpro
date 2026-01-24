'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  AlertCircle
} from 'lucide-react';

type RegistrationStep = 'clinic' | 'details' | 'success';

interface ClinicInfo {
  id: number;
  name: string;
  logoUrl: string | null;
}

export default function RegisterPage() {
  const router = useRouter();
  
  // Form state
  const [step, setStep] = useState<RegistrationStep>('clinic');
  const [clinicCode, setClinicCode] = useState('');
  const [clinic, setClinic] = useState<ClinicInfo | null>(null);
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
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  
  // Password validation
  const passwordRequirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];
  
  const isPasswordValid = passwordRequirements.every(req => req.met);
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
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.replace(/\D/g, ''),
          dob,
          clinicCode: clinicCode.trim(),
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      
      setStep('success');
      
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Go back to previous step
  const handleBack = () => {
    if (step === 'details') {
      setStep('clinic');
      setClinic(null);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg mb-4">
            <User className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Your Account</h1>
          <p className="text-gray-600 mt-1">Patient Registration</p>
        </div>
        
        {/* Progress Indicator */}
        {step !== 'success' && (
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              step === 'clinic' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-600'
            }`}>
              {step !== 'clinic' ? <Check className="h-4 w-4" /> : '1'}
            </div>
            <div className={`w-12 h-1 rounded ${step === 'details' ? 'bg-emerald-600' : 'bg-gray-200'}`} />
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              step === 'details' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              2
            </div>
          </div>
        )}
        
        {/* Form Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8">
            
            {/* STEP 1: Clinic Code */}
            {step === 'clinic' && (
              <form onSubmit={handleClinicCodeSubmit} className="space-y-6">
                <div className="text-center mb-6">
                  <Building2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-900">Enter Clinic Code</h2>
                  <p className="text-gray-600 text-sm mt-1">
                    Enter the registration code provided by your healthcare clinic
                  </p>
                </div>
                
                <div>
                  <label htmlFor="clinicCode" className="block text-sm font-medium text-gray-700 mb-2">
                    Clinic Code
                  </label>
                  <input
                    id="clinicCode"
                    type="text"
                    value={clinicCode}
                    onChange={(e) => setClinicCode(e.target.value.toUpperCase())}
                    placeholder="e.g., CLINIC123"
                    className="w-full px-4 py-3 text-lg font-mono tracking-wider uppercase bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    autoFocus
                    required
                  />
                </div>
                
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
                
                <button
                  type="submit"
                  disabled={loading || !clinicCode.trim()}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
                
                <div className="text-center pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-600">
                    Already have an account?{' '}
                    <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">
                      Sign in
                    </Link>
                  </p>
                </div>
              </form>
            )}
            
            {/* STEP 2: Registration Details */}
            {step === 'details' && clinic && (
              <form onSubmit={handleRegistrationSubmit} className="space-y-5">
                {/* Clinic Display */}
                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-xl mb-2">
                  <div className="flex items-center gap-3">
                    {clinic.logoUrl ? (
                      <img src={clinic.logoUrl} alt={clinic.name} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-emerald-600" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-emerald-600 font-medium">Registering with</p>
                      <p className="text-gray-900 font-semibold">{clinic.name}</p>
                    </div>
                  </div>
                  <button type="button" onClick={handleBack} className="text-sm text-gray-500 hover:text-gray-700">
                    Change
                  </button>
                </div>
                
                {/* Name Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>
                
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>
                
                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(555) 555-5555"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>
                
                {/* Date of Birth */}
                <div>
                  <label htmlFor="dob" className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Birth
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="dob"
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>
                
                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
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
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`w-full pl-10 pr-12 py-2.5 bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all ${
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
                
                {/* Terms Agreement */}
                <div className="flex items-start gap-3">
                  <input
                    id="terms"
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="terms" className="text-sm text-gray-600">
                    I agree to the{' '}
                    <a href="/terms" className="text-emerald-600 hover:underline">Terms of Service</a>
                    {' '}and{' '}
                    <a href="/privacy" className="text-emerald-600 hover:underline">Privacy Policy</a>
                  </label>
                </div>
                
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="px-4 py-3 text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-all flex items-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !isPasswordValid || !passwordsMatch || !agreedToTerms}
                    className="flex-1 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
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
              <div className="text-center space-y-6 py-4">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 rounded-full">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h2>
                  <p className="text-gray-600">
                    We've sent a verification link to
                  </p>
                  <p className="text-emerald-600 font-semibold mt-1">{email}</p>
                </div>
                
                <div className="bg-gray-50 rounded-xl p-4 text-left">
                  <h3 className="font-medium text-gray-900 mb-2">Next Steps:</h3>
                  <ol className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-xs font-medium">1</span>
                      Check your email inbox (and spam folder)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-xs font-medium">2</span>
                      Click the verification link in the email
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-xs font-medium">3</span>
                      Log in to access your patient portal
                    </li>
                  </ol>
                </div>
                
                <p className="text-xs text-gray-500">
                  The verification link expires in 24 hours
                </p>
                
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all"
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
                    className="text-emerald-600 hover:text-emerald-700 font-medium"
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
          <p className="text-xs text-gray-500">
            HIPAA Compliant Healthcare Platform
          </p>
        </div>
      </div>
    </div>
  );
}
