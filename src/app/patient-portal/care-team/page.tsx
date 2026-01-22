'use client';

import Link from 'next/link';
import {
  ChevronLeft,
  Phone,
  Video,
  MessageCircle,
  ChevronRight,
  Star,
  Calendar,
} from 'lucide-react';

export default function CareTeamPage() {
  const careTeam = [
    {
      id: 1,
      name: 'Dr. Connor Murphy',
      role: 'Primary Physician',
      specialty: 'Weight Management',
      avatar: 'CM',
      available: true,
      rating: 4.9,
      patients: 150,
    },
    {
      id: 2,
      name: 'Sandy Skotnicki, MD',
      role: 'Dermatologist',
      specialty: 'Aesthetic Medicine',
      avatar: 'SS',
      available: false,
      rating: 4.8,
      patients: 200,
    },
    {
      id: 3,
      name: 'Ashley Chen',
      role: 'Nutritionist',
      specialty: 'Dietary Planning',
      avatar: 'AC',
      available: true,
      rating: 4.9,
      patients: 120,
    },
    {
      id: 4,
      name: 'Becca AI',
      role: 'AI Assistant',
      specialty: '24/7 Support',
      avatar: 'AI',
      available: true,
      rating: 4.7,
      patients: 500,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/patient-portal" className="rounded-lg p-2 hover:bg-gray-100">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold">My Care Team</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {/* Book a Visit Card */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
          <h2 className="mb-2 text-xl font-semibold">Book a Visit</h2>
          <p className="mb-4 text-sm text-blue-100">Schedule your next appointment</p>

          <div className="flex gap-3">
            <button className="flex flex-1 flex-col items-center rounded-xl bg-white/20 py-3 backdrop-blur transition-colors hover:bg-white/30">
              <MessageCircle className="mb-1 h-6 w-6" />
              <span className="text-sm font-medium">Chat</span>
            </button>
            <button className="flex flex-1 flex-col items-center rounded-xl bg-white/20 py-3 backdrop-blur transition-colors hover:bg-white/30">
              <Phone className="mb-1 h-6 w-6" />
              <span className="text-sm font-medium">Call</span>
            </button>
            <button className="flex flex-1 flex-col items-center rounded-xl bg-white/20 py-3 backdrop-blur transition-colors hover:bg-white/30">
              <Video className="mb-1 h-6 w-6" />
              <span className="text-sm font-medium">Video</span>
            </button>
          </div>
        </div>

        {/* Team Members */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Care Providers</h2>

          {careTeam.map((member) => (
            <div
              key={member.id}
              className="rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full font-semibold text-white ${
                    member.avatar === 'AI'
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500'
                      : 'bg-gradient-to-br from-blue-500 to-blue-600'
                  }`}
                >
                  {member.avatar}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{member.name}</h3>
                      <p className="text-sm text-gray-600">{member.role}</p>
                      <p className="text-xs text-gray-500">{member.specialty}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>

                  {/* Stats */}
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-yellow-500" />
                      <span className="font-medium">{member.rating}</span>
                    </span>
                    <span className="text-gray-500">{member.patients}+ patients</span>
                    <span
                      className={`rounded-full px-2 py-1 font-medium ${
                        member.available
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {member.available ? 'Available' : 'Busy'}
                    </span>
                  </div>

                  {/* Quick Actions */}
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-200">
                      Message
                    </button>
                    {member.available && (
                      <button className="rounded-lg bg-[#4fa77e] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#3f8660]">
                        Book Appointment
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Concierge Card */}
        <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Concierge Service</h3>
              <p className="mt-1 text-sm text-gray-600">Need help? We can assist with anything</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
          </div>

          <button className="w-full rounded-lg bg-purple-600 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700">
            Contact Concierge
          </button>
        </div>
      </div>
    </div>
  );
}
