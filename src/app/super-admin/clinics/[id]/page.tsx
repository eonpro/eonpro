'use client';

// Clinic Detail Page - Super Admin
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Building2, Globe, Palette, Save, Trash2, 
  Users, Activity, Calendar, Settings, AlertTriangle
} from 'lucide-react';

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  adminEmail: string;
  phone?: string;
  address?: string;
  primaryColor?: string;
  secondaryColor?: string;
  isActive: boolean;
  plan: string;
  features: {
    telehealth?: boolean;
    messaging?: boolean;
    billing?: boolean;
    pharmacy?: boolean;
    ai?: boolean;
  };
  stats: {
    patients: number;
    providers: number;
    appointments: number;
  };
  createdAt: string;
}

export default function ClinicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.id;
  
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'branding' | 'features' | 'settings'>('overview');
  
  const [formData, setFormData] = useState({
    name: '',
    subdomain: '',
    customDomain: '',
    adminEmail: '',
    phone: '',
    address: '',
    primaryColor: '#0d9488',
    secondaryColor: '#6366f1',
    plan: 'professional',
    isActive: true,
    features: {
      telehealth: true,
      messaging: true,
      billing: true,
      pharmacy: false,
      ai: false,
    }
  });

  useEffect(() => {
    fetchClinic();
  }, [clinicId]);

  const fetchClinic = async () => {
    try {
      const mockClinic: Clinic = {
        id: Number(clinicId),
        name: clinicId === '1' ? 'EONPRO Main Clinic' : `Clinic ${clinicId}`,
        subdomain: clinicId === '1' ? 'main' : `clinic${clinicId}`,
        customDomain: clinicId === '1' ? 'app.eonpro.com' : undefined,
        adminEmail: `admin${clinicId}@eonpro.com`,
        phone: '(555) 123-4567',
        address: '123 Medical Center Dr, Suite 100, New York, NY 10001',
        primaryColor: '#0d9488',
        secondaryColor: '#6366f1',
        isActive: true,
        plan: 'professional',
        features: {
          telehealth: true,
          messaging: true,
          billing: true,
          pharmacy: clinicId === '1',
          ai: clinicId === '1',
        },
        stats: {
          patients: clinicId === '1' ? 1247 : Math.floor(Math.random() * 500),
          providers: clinicId === '1' ? 12 : Math.floor(Math.random() * 10) + 1,
          appointments: clinicId === '1' ? 3421 : Math.floor(Math.random() * 1000),
        },
        createdAt: '2024-01-15T00:00:00Z',
      };
      
      setClinic(mockClinic);
      setFormData({
        name: mockClinic.name,
        subdomain: mockClinic.subdomain,
        customDomain: mockClinic.customDomain || '',
        adminEmail: mockClinic.adminEmail,
        phone: mockClinic.phone || '',
        address: mockClinic.address || '',
        primaryColor: mockClinic.primaryColor || '#0d9488',
        secondaryColor: mockClinic.secondaryColor || '#6366f1',
        plan: mockClinic.plan,
        isActive: mockClinic.isActive,
        features: mockClinic.features,
      });
    } catch (error) {
      console.error('Error fetching clinic:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('Clinic settings saved successfully!');
    } catch (error) {
      console.error('Error saving clinic:', error);
      alert('Failed to save clinic settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this clinic? This action cannot be undone.')) {
      return;
    }
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      router.push('/super-admin/clinics');
    } catch (error) {
      console.error('Error deleting clinic:', error);
      alert('Failed to delete clinic');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Clinic not found</h2>
          <Link href="/super-admin/clinics" className="text-teal-600 hover:underline mt-2 inline-block">
            Back to clinics
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                href="/super-admin/clinics"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">{clinic.name}</h1>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    clinic.isActive 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {clinic.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-1">
                  {clinic.subdomain}.eonpro.com
                  {clinic.customDomain && (
                    <span className="ml-2">• {clinic.customDomain}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDelete}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="flex gap-6 mt-6 border-b border-gray-200 -mb-px">
            {[
              { id: 'overview', label: 'Overview', icon: Building2 },
              { id: 'branding', label: 'Branding', icon: Palette },
              { id: 'features', label: 'Features', icon: Settings },
              { id: 'settings', label: 'Settings', icon: Globe },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{clinic.stats.patients.toLocaleString()}</p>
                    <p className="text-gray-500 text-sm">Total Patients</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <Activity className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{clinic.stats.providers}</p>
                    <p className="text-gray-500 text-sm">Providers</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Calendar className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{clinic.stats.appointments.toLocaleString()}</p>
                    <p className="text-gray-500 text-sm">Total Appointments</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                  <input
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="starter">Starter</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'branding' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">White Label Branding</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
                  <div className="flex">
                    <input
                      type="text"
                      value={formData.subdomain}
                      onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <span className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500">
                      .eonpro.com
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain (optional)</label>
                  <input
                    type="text"
                    value={formData.customDomain}
                    onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                    placeholder="app.yourclinic.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 p-6 bg-gray-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Preview</h4>
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: formData.primaryColor }}
                  >
                    {formData.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: formData.primaryColor }}>{formData.name}</p>
                    <p className="text-sm text-gray-500">{formData.subdomain}.eonpro.com</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button 
                    className="px-4 py-2 rounded-lg text-white"
                    style={{ backgroundColor: formData.primaryColor }}
                  >
                    Primary Button
                  </button>
                  <button 
                    className="px-4 py-2 rounded-lg text-white"
                    style={{ backgroundColor: formData.secondaryColor }}
                  >
                    Secondary Button
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Enabled Features</h3>
              <div className="space-y-4">
                {[
                  { key: 'telehealth', label: 'Telehealth', description: 'Video consultations and virtual visits' },
                  { key: 'messaging', label: 'Secure Messaging', description: 'HIPAA-compliant patient messaging' },
                  { key: 'billing', label: 'Billing & Payments', description: 'Invoice and payment processing' },
                  { key: 'pharmacy', label: 'Pharmacy Integration', description: 'E-prescriptions and pharmacy network' },
                  { key: 'ai', label: 'AI Assistant (Becca)', description: 'AI-powered clinical assistance' },
                ].map((feature) => (
                  <div 
                    key={feature.key}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{feature.label}</p>
                      <p className="text-sm text-gray-500">{feature.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.features[feature.key as keyof typeof formData.features]}
                        onChange={(e) => setFormData({
                          ...formData,
                          features: {
                            ...formData.features,
                            [feature.key]: e.target.checked
                          }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinic Status</h3>
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Active Status</p>
                  <p className="text-sm text-gray-500">Enable or disable this clinic</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Danger Zone</h3>
              <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">Delete this clinic</p>
                    <p className="text-sm text-red-600 mt-1">
                      Once you delete a clinic, there is no going back. All data will be permanently removed.
                    </p>
                    <button
                      onClick={handleDelete}
                      className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Delete Clinic
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

