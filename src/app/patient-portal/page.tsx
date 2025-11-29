"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Scale, 
  Calendar, 
  FileText, 
  Video, 
  CreditCard, 
  Upload, 
  Pill, 
  MessageCircle,
  ChevronRight,
  TrendingDown,
  Activity,
  Bell,
  Home,
  User
} from "lucide-react";
import MedicationReminder from "@/components/MedicationReminder";
import WeightTracker from "@/components/WeightTracker";

export default function PatientPortalPage() {
  const [patient, setPatient] = useState<any>(null);
  const [hasActiveTreatment, setHasActiveTreatment] = useState(false);
  const [activeSection, setActiveSection] = useState<'dashboard' | 'progress' | 'reminders' | 'care' | 'billing'>('dashboard');

  useEffect(() => {
    // Mock patient data
    setPatient({
      id: 1,
      firstName: "Rebecca",
      lastName: "Pignano",
      email: "rebecca@eonmeds.com",
      hasTrackingNumber: true, // This would come from checking orders
    });
    setHasActiveTreatment(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 pb-20 md:pb-0">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="md:hidden px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Welcome back</p>
              <h1 className="text-xl font-bold">{patient?.firstName}</h1>
            </div>
            <button className="relative p-2">
              <Bell className="w-6 h-6 text-gray-700" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </div>
        <div className="hidden md:block max-w-6xl mx-auto px-4 py-3">
          <h1 className="text-lg font-semibold">Hello, {patient?.firstName}</h1>
        </div>
      </div>

      {/* Navigation Tabs - Desktop Only */}
      <div className="hidden md:block bg-white border-b sticky top-[57px] z-[5]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveSection('dashboard')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeSection === 'dashboard' 
                  ? 'text-purple-600 border-b-2 border-purple-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveSection('progress')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeSection === 'progress' 
                  ? 'text-purple-600 border-b-2 border-purple-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Weight Progress
            </button>
            <button
              onClick={() => setActiveSection('reminders')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeSection === 'reminders' 
                  ? 'text-purple-600 border-b-2 border-purple-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Medication
            </button>
            <button
              onClick={() => setActiveSection('care')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeSection === 'care' 
                  ? 'text-purple-600 border-b-2 border-purple-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Care Team
            </button>
            <button
              onClick={() => setActiveSection('billing')}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeSection === 'billing' 
                  ? 'text-purple-600 border-b-2 border-purple-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Billing
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto md:px-4 md:py-6">
        {activeSection === 'dashboard' && (
          <div className="md:grid md:grid-cols-2 md:gap-6">
            {/* Mobile: Full width cards */}
            <div className="md:hidden space-y-4 pb-4">
              {/* Weight Tracker Mobile */}
              <div className="px-4">
                <WeightTracker patientId={patient?.id} />
              </div>
              
              {/* Medication Reminders Mobile */}
              <div className="px-4">
                <MedicationReminder patientId={patient?.id} />
              </div>
            </div>
            
            {/* Desktop: Grid layout */}
            <div className="hidden md:block">
              <WeightTracker patientId={patient?.id} />
            </div>
            <div className="hidden md:block">
              <MedicationReminder patientId={patient?.id} />
            </div>

            {/* Quick Actions Mobile */}
            <div className="md:hidden px-4 space-y-3">
              <h2 className="text-lg font-bold mb-3">Quick Actions</h2>
              
              <Link href="/patient-portal/care-team" className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                    <User className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Care Team</h3>
                    <p className="text-xs text-gray-500">Your providers</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>

              <Link href="/patient-portal/tutorials" className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center">
                    <Video className="w-6 h-6 text-pink-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Tutorials</h3>
                    <p className="text-xs text-gray-500">How-to videos</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>

              <Link href="/patient-portal/dietary" className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Dietary Plans</h3>
                    <p className="text-xs text-gray-500">Meal guides</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>

              <Link href="/patient-portal/documents" className="flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                    <Upload className="w-6 h-6 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Documents</h3>
                    <p className="text-xs text-gray-500">Forms & uploads</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>
            </div>

            {/* Quick Actions Desktop */}
            <div className="hidden md:grid md:col-span-2 grid-cols-4 gap-4">
              <Link href="/patient-portal/care-team" className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-purple-100">
                <div className="flex items-center justify-between mb-3">
                  <User className="w-8 h-8 text-purple-500" />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
                <h3 className="font-semibold text-sm">Care Team</h3>
                <p className="text-xs text-gray-500 mt-1">Your providers</p>
              </Link>

              <Link href="/patient-portal/tutorials" className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-pink-100">
                <div className="flex items-center justify-between mb-3">
                  <Video className="w-8 h-8 text-pink-500" />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
                <h3 className="font-semibold text-sm">Tutorials</h3>
                <p className="text-xs text-gray-500 mt-1">How-to videos</p>
              </Link>

              <Link href="/patient-portal/dietary" className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-yellow-100">
                <div className="flex items-center justify-between mb-3">
                  <FileText className="w-8 h-8 text-yellow-600" />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
                <h3 className="font-semibold text-sm">Dietary Plans</h3>
                <p className="text-xs text-gray-500 mt-1">Meal guides</p>
              </Link>

              <Link href="/patient-portal/documents" className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-teal-100">
                <div className="flex items-center justify-between mb-3">
                  <Upload className="w-8 h-8 text-teal-500" />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
                <h3 className="font-semibold text-sm">Documents</h3>
                <p className="text-xs text-gray-500 mt-1">Forms & uploads</p>
              </Link>
            </div>

            {/* Mobile Treatment & Billing Cards */}
            <div className="md:hidden px-4 space-y-4 mt-6">
              {/* Treatment Card Mobile */}
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-white font-bold">Current Treatment</h2>
                    <Pill className="w-5 h-5 text-white/80" />
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <p className="font-bold text-lg">Semaglutide</p>
                      <p className="text-sm text-gray-500">0.5mg weekly injection</p>
                    </div>
                    <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                      ACTIVE
                    </span>
                  </div>
                  <Link href="/patient-portal/prescription" className="block w-full py-3 bg-purple-600 text-white text-center rounded-xl font-medium">
                    View Details
                  </Link>
                </div>
              </div>

              {/* Billing Card Mobile */}
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-lg">Billing</h2>
                    <CreditCard className="w-5 h-5 text-gray-400" />
                  </div>
                  
                  <div className="bg-gray-50 rounded-xl p-3 mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-600">Next payment</span>
                      <span className="text-sm font-bold">$99</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Due date</span>
                      <span className="text-sm font-medium">Dec 15, 2024</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-6 bg-gradient-to-r from-blue-600 to-blue-400 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">VISA</span>
                      </div>
                      <span className="text-sm">•••• 4242</span>
                    </div>
                    <button className="text-purple-600 text-sm font-medium">Change</button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Desktop Treatment & Billing Cards */}
            <div className="hidden md:grid md:col-span-2 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Current Treatment</h2>
                  <Pill className="w-5 h-5 text-purple-500" />
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-3 border-b">
                    <div>
                      <p className="font-medium">Semaglutide</p>
                      <p className="text-xs text-gray-500">0.5mg weekly</p>
                    </div>
                    <span className="px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 rounded-full text-xs font-medium">
                      Active
                    </span>
                  </div>
                  
                  <button className="w-full py-2 text-purple-600 text-sm font-medium hover:text-purple-700">
                    View Prescription Details →
                  </button>
                </div>
              </div>
              
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-teal-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Billing</h2>
                  <CreditCard className="w-5 h-5 text-teal-500" />
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Next billing date</span>
                    <span className="font-medium">Dec 15, 2024</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Payment method</span>
                    <span className="font-medium">•••• 4242</span>
                  </div>
                </div>
                
                <button className="w-full mt-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Update Billing Info
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'progress' && (
          <div className="md:max-w-2xl md:mx-auto px-4 md:px-0 py-4 md:py-6">
            <WeightTracker patientId={patient?.id} />
          </div>
        )}

        {activeSection === 'reminders' && (
          <div className="md:max-w-2xl md:mx-auto px-4 md:px-0 py-4 md:py-6">
            <MedicationReminder patientId={patient?.id} />
          </div>
        )}

        {activeSection === 'care' && (
          <div className="md:max-w-2xl md:mx-auto px-4 md:px-0 py-4 md:py-6">
            <div className="bg-white md:rounded-2xl p-4 md:p-6 md:shadow-sm">
              <h2 className="text-xl font-bold mb-4">Your Care Team</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                  <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-lg">DS</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-lg">Dr. Smith</p>
                    <p className="text-sm text-gray-600">Primary Provider</p>
                  </div>
                  <Link href="/patient-portal/chat" className="p-3 bg-purple-600 text-white rounded-full">
                    <MessageCircle className="w-5 h-5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'billing' && (
          <div className="md:max-w-2xl md:mx-auto px-4 md:px-0 py-4 md:py-6">
            <div className="space-y-4">
              <div className="bg-white md:rounded-2xl overflow-hidden md:shadow-sm">
                <div className="p-4 md:p-6">
                  <h2 className="text-xl font-bold mb-4">Billing & Payments</h2>
                  
                  <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-4 text-white mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-white/80 text-sm">Next Payment</span>
                      <span className="font-bold text-2xl">$99</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/80 text-sm">Due Date</span>
                      <span className="font-medium">Dec 15, 2024</span>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">Payment Method</span>
                      <button className="text-purple-600 text-sm font-medium">Edit</button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-400 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">VISA</span>
                      </div>
                      <span className="font-medium">•••• 4242</span>
                    </div>
                  </div>
                  
                  <button className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium mb-3">
                    View Payment History
                  </button>
                  
                  <button className="w-full py-3 border border-gray-300 rounded-xl font-medium">
                    Download Invoices
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Support Button - Floating */}
      <Link 
        href="/patient-portal/chat" 
        className="fixed bottom-20 md:bottom-8 right-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all transform hover:scale-110 z-10"
      >
        <MessageCircle className="w-6 h-6" />
      </Link>

      {/* Bottom Navigation (Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t md:hidden shadow-[0_-4px_6px_-1px_rgb(0_0_0_/_0.1)]">
        <div className="grid grid-cols-4 px-2">
          <button 
            onClick={() => setActiveSection('dashboard')}
            className="flex flex-col items-center py-2 px-1 relative"
          >
            {activeSection === 'dashboard' && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-purple-600"></div>
            )}
            <Home className={`w-6 h-6 ${activeSection === 'dashboard' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className={`text-[10px] mt-1 font-medium ${activeSection === 'dashboard' ? 'text-purple-600' : 'text-gray-400'}`}>
              Home
            </span>
          </button>
          <button 
            onClick={() => setActiveSection('progress')}
            className="flex flex-col items-center py-2 px-1 relative"
          >
            {activeSection === 'progress' && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-purple-600"></div>
            )}
            <Scale className={`w-6 h-6 ${activeSection === 'progress' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className={`text-[10px] mt-1 font-medium ${activeSection === 'progress' ? 'text-purple-600' : 'text-gray-400'}`}>
              Progress
            </span>
          </button>
          <button 
            onClick={() => setActiveSection('reminders')}
            className="flex flex-col items-center py-2 px-1 relative"
          >
            {activeSection === 'reminders' && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-purple-600"></div>
            )}
            <Calendar className={`w-6 h-6 ${activeSection === 'reminders' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className={`text-[10px] mt-1 font-medium ${activeSection === 'reminders' ? 'text-purple-600' : 'text-gray-400'}`}>
              Medication
            </span>
          </button>
          <button 
            onClick={() => setActiveSection('care')}
            className="flex flex-col items-center py-2 px-1 relative"
          >
            {activeSection === 'care' && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-purple-600"></div>
            )}
            <User className={`w-6 h-6 ${activeSection === 'care' ? 'text-purple-600' : 'text-gray-400'}`} />
            <span className={`text-[10px] mt-1 font-medium ${activeSection === 'care' ? 'text-purple-600' : 'text-gray-400'}`}>
              Care
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
