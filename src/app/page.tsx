'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Shield, Users, Activity, Heart, LogIn, 
  Stethoscope, Pill, Calendar, MessageSquare,
  Lock, Database, CheckCircle, Sparkles
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is already logged in
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        // Redirect based on role
        switch(userData.role?.toLowerCase()) {
          case 'super_admin':
            router.push('/super-admin');
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
            break;
        }
      } catch {
        // Invalid user data, clear it
        localStorage.removeItem('user');
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-100">
      {/* Hero Section */}
      <div className="pt-16 pb-12 px-8">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center justify-center p-4 bg-white rounded-2xl shadow-xl mb-8">
            <img 
              src="https://static.wixstatic.com/media/c49a9b_2e6625f0f27d44068998ab51675c6d7b~mv2.png"
              alt="EONPRO"
              className="h-16 w-16"
            />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-4">
            EONPRO
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-4 max-w-3xl mx-auto">
            Enterprise Healthcare Management Platform
          </p>
          <p className="text-lg text-emerald-600 font-medium mb-8">
            HIPAA Compliant • Multi-Clinic • AI-Powered
          </p>
          
          <div className="flex items-center justify-center space-x-4">
            <Link
              href="/login"
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl flex items-center transform hover:-translate-y-0.5"
            >
              <LogIn className="h-5 w-5 mr-2" />
              Sign In
            </Link>
            <Link
              href="#features"
              className="px-8 py-4 bg-white text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors border border-gray-200 shadow-md flex items-center"
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white/80 backdrop-blur-sm border-y border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-emerald-600">99.9%</div>
              <div className="text-sm text-gray-600">Uptime SLA</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-600">HIPAA</div>
              <div className="text-sm text-gray-600">Compliant</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-600">256-bit</div>
              <div className="text-sm text-gray-600">PHI Encryption</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-emerald-600">24/7</div>
              <div className="text-sm text-gray-600">Support</div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="py-16 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Complete Healthcare Solution
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Everything you need to manage your practice, from patient intake to prescription fulfillment
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* AI-Powered */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Becca AI Assistant
              </h3>
              <p className="text-gray-600 text-sm">
                AI-powered SOAP note generation, patient queries, and clinical decision support
              </p>
            </div>

            {/* E-Prescribing */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mb-4">
                <Pill className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Lifefile Integration
              </h3>
              <p className="text-gray-600 text-sm">
                Direct pharmacy connectivity for e-prescriptions, tracking, and order management
              </p>
            </div>

            {/* Security */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-4">
                <Lock className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                HIPAA Security
              </h3>
              <p className="text-gray-600 text-sm">
                PHI encryption, audit logging, role-based access, and comprehensive compliance controls
              </p>
            </div>

            {/* Multi-Clinic */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-4">
                <Database className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Multi-Clinic Support
              </h3>
              <p className="text-gray-600 text-sm">
                Row-level security, automatic data isolation, and clinic-specific branding
              </p>
            </div>

            {/* Clinical Tools */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center mb-4">
                <Stethoscope className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Clinical Workflow
              </h3>
              <p className="text-gray-600 text-sm">
                SOAP notes, intake forms, care plans, superbills, and comprehensive patient management
              </p>
            </div>

            {/* Telehealth */}
            <div className="p-6 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Telehealth Ready
              </h3>
              <p className="text-gray-600 text-sm">
                Integrated video consultations, secure messaging, and remote patient monitoring
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Role Access Section */}
      <div className="bg-white py-16 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Role-Based Access Control
            </h2>
            <p className="text-lg text-gray-600">
              Secure, permission-based access for every team member
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { name: 'Super Admin', color: 'red', icon: Shield },
              { name: 'Admin', color: 'purple', icon: Users },
              { name: 'Provider', color: 'emerald', icon: Stethoscope },
              { name: 'Staff', color: 'cyan', icon: Calendar },
              { name: 'Support', color: 'amber', icon: MessageSquare },
              { name: 'Patient', color: 'blue', icon: Heart },
              { name: 'Influencer', color: 'pink', icon: Activity },
            ].map((role) => (
              <div key={role.name} className="text-center p-4 bg-gray-50 rounded-xl">
                <div className={`w-10 h-10 mx-auto bg-${role.color}-100 rounded-lg flex items-center justify-center mb-2`}>
                  <role.icon className={`h-5 w-5 text-${role.color}-600`} />
                </div>
                <div className="text-sm font-medium text-gray-900">{role.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-3xl p-12 text-white shadow-2xl">
            <h2 className="text-3xl font-bold mb-4">
              Ready to Transform Your Practice?
            </h2>
            <p className="text-lg text-emerald-100 mb-8">
              Join healthcare providers already using EONPRO for streamlined operations
            </p>
            <Link
              href="/login"
              className="inline-flex items-center px-8 py-4 bg-white text-emerald-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-lg"
            >
              <LogIn className="h-5 w-5 mr-2" />
              Get Started Now
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img 
                src="https://static.wixstatic.com/media/c49a9b_2e6625f0f27d44068998ab51675c6d7b~mv2.png"
                alt="EONPRO"
                className="h-8 w-8 mr-3"
              />
              <span className="text-xl font-bold">EONPRO</span>
            </div>
            <div className="text-center md:text-right">
              <p className="text-sm text-gray-400">
                Enterprise Healthcare Management Platform
              </p>
              <p className="text-xs text-gray-500 mt-1">
                HIPAA Compliant • SOC 2 Ready • Multi-Clinic Support
              </p>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center">
            <p className="text-xs text-gray-500">
              © {new Date().getFullYear()} EONPRO. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
