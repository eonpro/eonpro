'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Shield, Users, Activity, Heart, LogIn, 
  ChevronRight, Lock, Eye, Database, CheckCircle
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is already logged in
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      // Redirect based on role
      switch(userData.role?.toLowerCase()) {
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
        default:
          break;
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="pt-20 pb-16 px-8">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-lg shadow-md mb-6">
            <img 
              src="https://static.wixstatic.com/media/c49a9b_2e6625f0f27d44068998ab51675c6d7b~mv2.png"
              alt="EONPRO icon"
              className="h-12 w-12"
            />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            EONPRO
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Comprehensive Healthcare Management Platform
          </p>
          
          <div className="flex items-center justify-center space-x-4">
            <Link
              href="/demo/login"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center"
            >
              <LogIn className="h-5 w-5 mr-2" />
              Demo Login
            </Link>
            <Link
              href="/demo/roles"
              className="px-6 py-3 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors border border-gray-300 flex items-center"
            >
              <Eye className="h-5 w-5 mr-2" />
              View Role Matrix
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Platform Features
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Security */}
            <div className="p-6 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Lock className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                HIPAA Compliant
              </h3>
              <p className="text-gray-600 text-sm">
                PHI encryption, audit logging, session management, and comprehensive security controls
              </p>
              <div className="mt-3 text-xs text-green-600 font-medium">
                Security Score: 98/100
              </div>
            </div>

            {/* Multi-Clinic */}
            <div className="p-6 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Database className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Multi-Clinic Support
              </h3>
              <p className="text-gray-600 text-sm">
                Row-level security, automatic data isolation, and clinic-specific branding
              </p>
            </div>

            {/* Role-Based Access */}
            <div className="p-6 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                7 User Roles
              </h3>
              <p className="text-gray-600 text-sm">
                Admin, Provider, Staff, Support, Patient, Influencer, and Super Admin
              </p>
            </div>

            {/* Clinical Features */}
            <div className="p-6 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mb-4">
                <Activity className="h-6 w-6 text-cyan-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Clinical Tools
              </h3>
              <p className="text-gray-600 text-sm">
                SOAP notes, e-prescribing, lab orders, patient timeline, and medication tracking
              </p>
            </div>

            {/* Patient Portal */}
            <div className="p-6 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center mb-4">
                <Heart className="h-6 w-6 text-pink-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Patient Portal
              </h3>
              <p className="text-gray-600 text-sm">
                Health records, appointments, secure messaging, and document management
              </p>
            </div>

            {/* Support System */}
            <div className="p-6 bg-gray-50 rounded-xl">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                <CheckCircle className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Ticketing System
              </h3>
              <p className="text-gray-600 text-sm">
                Comprehensive issue tracking, SLA management, and internal communication
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Users Section */}
      <div className="py-16 px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            Available Demo Accounts
          </h2>
          
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Password
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Access Level
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                      Admin
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">admin@lifefile.com</td>
                  <td className="px-6 py-4 text-sm text-gray-500">admin123</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Full clinic management</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                      Provider
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">provider@lifefile.com</td>
                  <td className="px-6 py-4 text-sm text-gray-500">provider123</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Patient care & clinical</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-cyan-100 text-cyan-800 rounded-full">
                      Staff
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">staff@lifefile.com</td>
                  <td className="px-6 py-4 text-sm text-gray-500">staff123</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Administrative tasks</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                      Support
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">support@lifefile.com</td>
                  <td className="px-6 py-4 text-sm text-gray-500">support123</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Customer support</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                      Patient
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">patient@example.com</td>
                  <td className="px-6 py-4 text-sm text-gray-500">patient123</td>
                  <td className="px-6 py-4 text-sm text-gray-500">Personal health portal</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-center mt-8">
            <Link
              href="/demo/login"
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Try Demo Login
              <ChevronRight className="h-5 w-5 ml-2" />
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 px-8">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-gray-400">
            Lifefile Health Platform - Enterprise Healthcare Management System
          </p>
          <p className="text-xs text-gray-500 mt-2">
            HIPAA Compliant | Multi-Clinic Support | Production Ready
          </p>
        </div>
      </footer>
    </div>
  );
}