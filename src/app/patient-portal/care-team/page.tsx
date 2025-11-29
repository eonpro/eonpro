"use client";

import Link from "next/link";
import { ChevronLeft, Phone, Video, MessageCircle, ChevronRight, Star, Calendar } from "lucide-react";

export default function CareTeamPage() {
  const careTeam = [
    {
      id: 1,
      name: "Dr. Connor Murphy",
      role: "Primary Physician",
      specialty: "Weight Management",
      avatar: "CM",
      available: true,
      rating: 4.9,
      patients: 150,
    },
    {
      id: 2,
      name: "Sandy Skotnicki, MD",
      role: "Dermatologist",
      specialty: "Aesthetic Medicine",
      avatar: "SS",
      available: false,
      rating: 4.8,
      patients: 200,
    },
    {
      id: 3,
      name: "Ashley Chen",
      role: "Nutritionist",
      specialty: "Dietary Planning",
      avatar: "AC",
      available: true,
      rating: 4.9,
      patients: 120,
    },
    {
      id: 4,
      name: "Becca AI",
      role: "AI Assistant",
      specialty: "24/7 Support",
      avatar: "AI",
      available: true,
      rating: 4.7,
      patients: 500,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/patient-portal" className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-semibold">My Care Team</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Book a Visit Card */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
          <h2 className="text-xl font-bold mb-2">Book a Visit</h2>
          <p className="text-blue-100 text-sm mb-4">Schedule your next appointment</p>
          
          <div className="flex gap-3">
            <button className="flex-1 bg-white/20 backdrop-blur rounded-xl py-3 flex flex-col items-center hover:bg-white/30 transition-colors">
              <MessageCircle className="w-6 h-6 mb-1" />
              <span className="text-sm font-medium">Chat</span>
            </button>
            <button className="flex-1 bg-white/20 backdrop-blur rounded-xl py-3 flex flex-col items-center hover:bg-white/30 transition-colors">
              <Phone className="w-6 h-6 mb-1" />
              <span className="text-sm font-medium">Call</span>
            </button>
            <button className="flex-1 bg-white/20 backdrop-blur rounded-xl py-3 flex flex-col items-center hover:bg-white/30 transition-colors">
              <Video className="w-6 h-6 mb-1" />
              <span className="text-sm font-medium">Video</span>
            </button>
          </div>
        </div>

        {/* Team Members */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Care Providers</h2>
          
          {careTeam.map(member => (
            <div
              key={member.id}
              className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold ${
                  member.avatar === "AI" ? "bg-gradient-to-br from-purple-500 to-pink-500" : "bg-gradient-to-br from-blue-500 to-blue-600"
                }`}>
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
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-3 text-xs">
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="font-medium">{member.rating}</span>
                    </span>
                    <span className="text-gray-500">
                      {member.patients}+ patients
                    </span>
                    <span className={`px-2 py-1 rounded-full font-medium ${
                      member.available
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {member.available ? "Available" : "Busy"}
                    </span>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-2 mt-3">
                    <button className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium transition-colors">
                      Message
                    </button>
                    {member.available && (
                      <button className="px-3 py-1.5 bg-[#4fa77e] text-white hover:bg-[#3f8660] rounded-lg text-xs font-medium transition-colors">
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
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">Concierge Service</h3>
              <p className="text-sm text-gray-600 mt-1">Need help? We can assist with anything</p>
            </div>
            <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
          </div>
          
          <button className="w-full py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
            Contact Concierge
          </button>
        </div>
      </div>
    </div>
  );
}
