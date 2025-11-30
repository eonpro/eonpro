'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Shield, Users, Activity, UserCheck, Headphones, Heart, Star,
  LogIn, Eye, EyeOff
} from 'lucide-react';

interface DemoUser {
  id: number;
  email: string;
  password: string;
  role: string;
  firstName: string;
  lastName: string;
  token: string;
  redirectTo: string;
}

// Demo users with pre-generated tokens (in production, these would come from a secure API)
const DEMO_USERS: DemoUser[] = [
  {
    id: 0,
    email: 'superadmin@eonpro.com',
    password: 'SuperAdmin2024!',
    role: 'super_admin',
    firstName: 'Super',
    lastName: 'Admin',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MCwiZW1haWwiOiJzdXBlcmFkbWluQGVvbnByby5jb20iLCJyb2xlIjoic3VwZXJfYWRtaW4ifQ.demo-superadmin-token',
    redirectTo: '/super-admin'
  },
  {
    id: 1,
    email: 'admin@eonpro.com',
    password: 'admin123',
    role: 'admin',
    firstName: 'Admin',
    lastName: 'User',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBsaWZlZmlsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJjbGluaWNJZCI6MX0.demo-admin-token',
    redirectTo: '/admin'
  },
  {
    id: 2,
    email: 'provider@eonpro.com',
    password: 'provider123',
    role: 'provider',
    firstName: 'Dr. John',
    lastName: 'Smith',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiZW1haWwiOiJwcm92aWRlckBsaWZlZmlsZS5jb20iLCJyb2xlIjoicHJvdmlkZXIiLCJjbGluaWNJZCI6MX0.demo-provider-token',
    redirectTo: '/provider'
  },
  {
    id: 3,
    email: 'staff@eonpro.com',
    password: 'staff123',
    role: 'staff',
    firstName: 'Jane',
    lastName: 'Doe',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywiZW1haWwiOiJzdGFmZkBsaWZlZmlsZS5jb20iLCJyb2xlIjoic3RhZmYiLCJjbGluaWNJZCI6MX0.demo-staff-token',
    redirectTo: '/staff'
  },
  {
    id: 4,
    email: 'support@eonpro.com',
    password: 'support123',
    role: 'support',
    firstName: 'Support',
    lastName: 'Agent',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NCwiZW1haWwiOiJzdXBwb3J0QGxpZmVmaWxlLmNvbSIsInJvbGUiOiJzdXBwb3J0IiwiY2xpbmljSWQiOjF9.demo-support-token',
    redirectTo: '/support'
  },
  {
    id: 5,
    email: 'patient@example.com',
    password: 'patient123',
    role: 'patient',
    firstName: 'John',
    lastName: 'Patient',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NSwiZW1haWwiOiJwYXRpZW50QGV4YW1wbGUuY29tIiwicm9sZSI6InBhdGllbnQiLCJjbGluaWNJZCI6MX0.demo-patient-token',
    redirectTo: '/patient-portal'
  }
];

const roleIcons: Record<string, any> = {
  super_admin: Shield,
  admin: Users,
  provider: Activity,
  staff: UserCheck,
  support: Headphones,
  patient: Heart,
  influencer: Star
};

const roleColors: Record<string, string> = {
  super_admin: 'from-slate-700 to-slate-900',
  admin: 'from-purple-600 to-indigo-700',
  provider: 'from-green-600 to-teal-700',
  staff: 'from-cyan-600 to-blue-700',
  support: 'from-amber-600 to-orange-700',
  patient: 'from-blue-500 to-indigo-600',
  influencer: 'from-pink-500 to-purple-600'
};

export default function DemoLoginPage() {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState<DemoUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleQuickLogin = (user: DemoUser) => {
    setSelectedUser(user);
    setEmail(user.email);
    setPassword(user.password);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Find matching user
    const user = DEMO_USERS.find(u => u.email === email && u.password === password);

    if (!user) {
      setError('Invalid email or password');
      setLoading(false);
      return;
    }

    // Simulate login delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Store user data in localStorage
    localStorage.setItem('user', JSON.stringify({
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      clinicId: 1,
      clinicName: 'Main Clinic'
    }));

    // Store appropriate token based on role
    localStorage.setItem('auth-token', user.token);
    if (user.role === 'admin') {
      localStorage.setItem('admin-token', user.token);
    } else if (user.role === 'provider') {
      localStorage.setItem('provider-token', user.token);
    } else if (user.role === 'influencer') {
      localStorage.setItem('influencer-token', user.token);
    }

    setLoading(false);

    // Redirect to appropriate dashboard
    router.push(user.redirectTo);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-8">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-lg shadow-md mb-4">
            <img 
              src="https://static.wixstatic.com/media/c49a9b_2e6625f0f27d44068998ab51675c6d7b~mv2.png"
              alt="EONPRO icon"
              className="h-10 w-10"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Demo Login</h1>
          <p className="text-gray-600">Select a demo user or enter credentials to test different role access</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Quick Login Cards */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Login</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_USERS.map((user) => {
                const Icon = roleIcons[user.role] || Users;
                const isSelected = selectedUser?.id === user.id;
                
                return (
                  <button
                    key={user.id}
                    onClick={() => handleQuickLogin(user)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className={`p-2 rounded-lg bg-gradient-to-r ${roleColors[user.role]}`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{user.email}</p>
                        <p className="text-xs text-gray-400">Pass: {user.password}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Role Descriptions */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Role Capabilities</h3>
              <div className="space-y-2 text-xs text-gray-600">
                <div><strong>Admin:</strong> Full clinic management, all patient access, financial reports</div>
                <div><strong>Provider:</strong> Patient care, SOAP notes, prescriptions, lab orders</div>
                <div><strong>Staff:</strong> Patient intake, appointments, orders, documents</div>
                <div><strong>Support:</strong> Tickets, customer help, knowledge base</div>
                <div><strong>Patient:</strong> Personal health records, appointments, messages</div>
              </div>
            </div>
          </div>

          {/* Login Form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign In</h2>
            
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full px-4 py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center ${
                  loading 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5 mr-2" />
                    Sign In
                  </>
                )}
              </button>
            </form>

            {/* Selected User Info */}
            {selectedUser && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-900">
                  Selected: {selectedUser.firstName} {selectedUser.lastName}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Role: {selectedUser.role} | Redirects to: {selectedUser.redirectTo}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            This is a demo environment. No real patient data is used.
          </p>
          <div className="mt-2 space-x-4">
            <a href="/demo/roles" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View Role Matrix →
            </a>
            <a href="/api-docs" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              API Documentation →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
