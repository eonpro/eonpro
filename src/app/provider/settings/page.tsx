'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Shield, PenTool, Key, Save, Trash2, Upload,
  Check, AlertCircle, Eye, EyeOff, Building2
} from 'lucide-react';

interface ProviderSettings {
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    clinicId: number;
  };
  provider: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    npi: string;
    dea: string;
    licenseNumber: string;
    licenseState: string;
    titleLine: string;
    signatureDataUrl: string;
    hasSignature: boolean;
  } | null;
  clinics: Array<{
    id: number;
    name: string;
    subdomain: string;
    role: string;
    isPrimary: boolean;
  }>;
  activeClinicId: number;
  hasMultipleClinics: boolean;
}

export default function ProviderSettingsPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [userData, setUserData] = useState<any>(null);
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'credentials' | 'signature' | 'password'>('profile');

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [titleLine, setTitleLine] = useState('');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Credentials registration state
  const [npi, setNpi] = useState('');
  const [dea, setDea] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [verifyingNpi, setVerifyingNpi] = useState(false);
  const [npiVerified, setNpiVerified] = useState(false);

  // Signature state
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);

  useEffect(() => {
    // Check authentication
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    const data = JSON.parse(user);
    if (data.role?.toLowerCase() !== 'provider') {
      router.push('/login');
      return;
    }

    setUserData(data);
    fetchSettings();
  }, [router]);

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      const response = await fetch('/api/provider/settings', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }

      const data = await response.json();
      setSettings(data);

      // Populate form
      if (data.provider) {
        setFirstName(data.provider.firstName || '');
        setLastName(data.provider.lastName || '');
        setPhone(data.provider.phone || '');
        setTitleLine(data.provider.titleLine || '');
        if (data.provider.signatureDataUrl) {
          setSignatureData(data.provider.signatureDataUrl);
        }
      } else if (data.user) {
        setFirstName(data.user.firstName || '');
        setLastName(data.user.lastName || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  // Canvas drawing functions
  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    if (activeTab === 'signature') {
      initCanvas();
      // Load existing signature if available
      if (signatureData && !hasDrawnSignature) {
        loadSignatureToCanvas(signatureData);
      }
    }
  }, [activeTab, signatureData, hasDrawnSignature]);

  const loadSignatureToCanvas = (dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawnSignature(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    initCanvas();
    setHasDrawnSignature(false);
    setSignatureData(null);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    return canvas.toDataURL('image/png');
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      const response = await fetch('/api/provider/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          titleLine,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess('Profile updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSignature = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const signatureDataUrl = saveSignature();

      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      const response = await fetch('/api/provider/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          signatureDataUrl,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save signature');
      }

      setSignatureData(signatureDataUrl);
      setSuccess('Signature saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      const response = await fetch('/api/provider/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to change password');
      }

      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSignatureData(dataUrl);
      loadSignatureToCanvas(dataUrl);
      setHasDrawnSignature(true);
    };
    reader.readAsDataURL(file);
  };

  const verifyNpi = async () => {
    if (!/^\d{10}$/.test(npi)) {
      setError('Enter a valid 10-digit NPI');
      return;
    }

    setVerifyingNpi(true);
    setError('');

    try {
      const res = await fetch('/api/providers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npi }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to verify NPI');
      }

      // Auto-populate from NPI registry
      const basic = data.result.basic || {};
      const address = data.result.addresses?.find(
        (addr: any) => addr.addressPurpose === 'LOCATION'
      ) || data.result.addresses?.[0];

      if (basic.firstName || basic.first_name) {
        setFirstName(basic.firstName || basic.first_name || firstName);
      }
      if (basic.lastName || basic.last_name) {
        setLastName(basic.lastName || basic.last_name || lastName);
      }
      if (basic.credential) {
        setTitleLine(basic.credential);
      }
      if (address?.state) {
        setLicenseState(address.state);
      }

      setNpiVerified(true);
      setSuccess('NPI verified successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to verify NPI');
    } finally {
      setVerifyingNpi(false);
    }
  };

  const handleRegisterCredentials = async () => {
    if (!npi || !npiVerified) {
      setError('Please verify your NPI first');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      const response = await fetch('/api/provider/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          titleLine,
          npi,
          dea,
          licenseNumber,
          licenseState,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to register credentials');
      }

      setSuccess('Provider credentials registered successfully!');
      fetchSettings(); // Refresh data
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return null; // Layout handles the loading state
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'credentials', label: 'Credentials', icon: Shield },
    { id: 'signature', label: 'Signature', icon: PenTool },
    { id: 'password', label: 'Password', icon: Key },
  ];

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#4fa77e] to-[#3d9268] rounded-2xl p-6 text-white shadow-sm">
          <h1 className="text-2xl font-bold mb-2">Settings</h1>
          <p className="text-green-100">Manage your profile, credentials, and signature</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            <Check className="h-5 w-5" />
            <span>{success}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-100">
            <nav className="flex -mb-px">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-[#4fa77e] text-[#4fa77e]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={settings?.user?.email || ''}
                    disabled
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Contact support to change your email</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title / Specialty
                  </label>
                  <input
                    type="text"
                    value={titleLine}
                    onChange={(e) => setTitleLine(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="e.g., Board Certified Internal Medicine"
                  />
                </div>

                {/* Clinics */}
                {settings?.hasMultipleClinics && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Building2 className="h-4 w-4 inline mr-1" />
                      Associated Clinics
                    </label>
                    <div className="space-y-2">
                      {settings.clinics.map((clinic) => (
                        <div
                          key={clinic.id}
                          className={`p-3 rounded-lg border ${
                            clinic.id === settings.activeClinicId
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{clinic.name}</span>
                            {clinic.isPrimary && (
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                                Primary
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">{clinic.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d9268] disabled:opacity-50 transition-colors"
                  >
                    {saving ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {/* Credentials Tab */}
            {activeTab === 'credentials' && (
              <div className="space-y-6">
                {settings?.provider?.npi ? (
                  <>
                    {/* Existing credentials - read only */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-700">
                        <Check className="h-4 w-4 inline mr-1" />
                        Your provider credentials are registered. Contact your clinic administrator to update them.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          NPI Number
                        </label>
                        <input
                          type="text"
                          value={settings?.provider?.npi || 'Not set'}
                          disabled
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          DEA Number
                        </label>
                        <input
                          type="text"
                          value={settings?.provider?.dea || 'Not set'}
                          disabled
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          License Number
                        </label>
                        <input
                          type="text"
                          value={settings?.provider?.licenseNumber || 'Not set'}
                          disabled
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          License State
                        </label>
                        <input
                          type="text"
                          value={settings?.provider?.licenseState || 'Not set'}
                          disabled
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Register credentials form */}
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-sm text-amber-800 font-medium">
                        <AlertCircle className="h-4 w-4 inline mr-1" />
                        Provider Credentials Required
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        To write prescriptions, you need to register your NPI and DEA credentials.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* NPI with verification */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          NPI Number *
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={npi}
                            onChange={(e) => {
                              setNpi(e.target.value.replace(/\D/g, '').slice(0, 10));
                              setNpiVerified(false);
                            }}
                            placeholder="Enter your 10-digit NPI"
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 font-mono"
                          />
                          <button
                            type="button"
                            onClick={verifyNpi}
                            disabled={verifyingNpi || npi.length !== 10 || npiVerified}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                              npiVerified
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                            }`}
                          >
                            {verifyingNpi ? (
                              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                            ) : npiVerified ? (
                              <Check className="h-5 w-5" />
                            ) : (
                              'Verify'
                            )}
                          </button>
                        </div>
                        {npiVerified && (
                          <p className="text-sm text-green-600 mt-1">
                            <Check className="h-4 w-4 inline mr-1" />
                            NPI verified successfully
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            DEA Number
                          </label>
                          <input
                            type="text"
                            value={dea}
                            onChange={(e) => setDea(e.target.value.toUpperCase())}
                            placeholder="e.g., AB1234567"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            License Number
                          </label>
                          <input
                            type="text"
                            value={licenseNumber}
                            onChange={(e) => setLicenseNumber(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          License State
                        </label>
                        <select
                          value={licenseState}
                          onChange={(e) => setLicenseState(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">Select State</option>
                          {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex justify-end pt-4">
                        <button
                          onClick={handleRegisterCredentials}
                          disabled={saving || !npiVerified}
                          className="flex items-center gap-2 px-6 py-2 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d9268] disabled:opacity-50 transition-colors"
                        >
                          {saving ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Register Credentials
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Signature Tab */}
            {activeTab === 'signature' && (
              <div className="space-y-6">
                <p className="text-sm text-gray-600">
                  Draw your signature below or upload an image. This signature will be used on prescriptions and documents.
                </p>

                {/* Signature Canvas */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    className="w-full bg-white border border-gray-200 rounded cursor-crosshair touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>

                {/* Signature Actions */}
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={clearSignature}
                    className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear
                  </button>

                  <label className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                    <Upload className="h-4 w-4" />
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="flex-1" />

                  <button
                    onClick={handleSaveSignature}
                    disabled={saving || !hasDrawnSignature}
                    className="flex items-center gap-2 px-6 py-2 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d9268] disabled:opacity-50 transition-colors"
                  >
                    {saving ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Signature
                  </button>
                </div>

                {/* Current Signature Preview */}
                {signatureData && !hasDrawnSignature && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Current Saved Signature</h3>
                    <div className="inline-block p-4 bg-white border border-gray-200 rounded-lg">
                      <img
                        src={signatureData}
                        alt="Current signature"
                        className="max-h-24"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Password Tab */}
            {activeTab === 'password' && (
              <div className="space-y-6 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleChangePassword}
                    disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                    className="flex items-center gap-2 px-6 py-2 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d9268] disabled:opacity-50 transition-colors"
                  >
                    {saving ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    ) : (
                      <Key className="h-4 w-4" />
                    )}
                    Change Password
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
