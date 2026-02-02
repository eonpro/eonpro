"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logger } from '@/lib/logger';

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag: any) => (typeof tag === "string" ? tag.replace(/^#/, "") : ""))
    .filter(Boolean);
}

// Generate consistent colors for hashtags
const getTagColor = (tag: string) => {
  const colors = [
    { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
    { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
    { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
    { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
    { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
    { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
    { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
    { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
    { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  ];
  
  // Generate a consistent hash from the tag string
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return colors[Math.abs(hash) % colors.length];
};

export default function IntakesPage() {
  const router = useRouter();
  const [intakes, setIntakes] = useState<any[]>([]);
  const [filteredIntakes, setFilteredIntakes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/intakes')
      .then(res => res.json())
      .then(data => {
        const intakeData = data.intakes || [];
        setIntakes(intakeData);
        setFilteredIntakes(intakeData);
        setLoading(false);
      })
      .catch(err => {
        logger.error('Error fetching intakes:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // Filter intakes based on search term
    const filtered = intakes.filter((doc: any) => {
      const patient = doc.patient;
      if (!patient) return false;
      
      const searchLower = searchTerm.toLowerCase();
      const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
      const email = (patient.email || '').toLowerCase();
      const patientId = String(patient.patientId || patient.id || '');
      const phone = (patient.phone || '');
      
      return (
        fullName.includes(searchLower) ||
        email.includes(searchLower) ||
        patientId.includes(searchTerm) ||
        phone.includes(searchTerm)
      );
    });
    
    setFilteredIntakes(filtered);
  }, [searchTerm, intakes]);

  const handleRowClick = (patientId: number) => {
    window.location.href = `/patients/${patientId}`;
  };

  if (loading) {
    return (
      <div className="p-10 flex justify-center items-center min-h-[400px]">
        <div className="text-gray-500">Loading intakes...</div>
      </div>
    );
  }

  return (
    <div className="p-10 space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">New Intakes</h1>
            <p className="text-gray-600 mt-1">
              Showing the most recent MedLink submissions that were synced into the EMR.
            </p>
          </div>
          <span className="rounded-full bg-green-50 px-4 py-1 text-sm font-semibold text-[#4fa77e] border border-green-100 whitespace-nowrap">
            {filteredIntakes.length} {searchTerm ? 'results found' : 'recent submissions'}
          </span>
        </div>
        
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, email, ID, or phone..."
            value={searchTerm}
            onChange={(e: any) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e] focus:border-[#4fa77e] text-sm"
          />
          <svg
            className="absolute right-3 top-2.5 h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Patient ID</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Forms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredIntakes.map((doc: any) => {
              const patient = doc.patient;
              const tags = formatTags(patient?.tags ?? []);
              return (
                <tr 
                  key={doc.id} 
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => patient && handleRowClick(patient.id)}
                >
                  <td className="px-4 py-4">
                    {patient ? (
                      <div>
                        <span className="font-semibold text-gray-900">
                          {patient.firstName} {patient.lastName}
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          {patient.email}
                        </p>
                      </div>
                    ) : (
                      <span className="text-gray-400">Patient record missing</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-sm">#{patient?.patientId || patient?.id || "—"}</p>
                    <p className="text-xs text-gray-500">
                      {doc.sourceSubmissionId ? `Submission: ${doc.sourceSubmissionId.slice(0, 12)}...` : "—"}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {formatter.format(new Date(doc.createdAt))}
                  </td>
                  <td className="px-4 py-4">
                    {tags.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag: any) => {
                          const color = getTagColor(tag);
                          return (
                            <span
                              key={tag}
                              className={`rounded-full ${color.bg} ${color.border} ${color.text} border px-2 py-0.5 text-xs font-medium`}
                            >
                              #{tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4" onClick={(e: any) => e.stopPropagation()}>
                    <Link
                      href={`/api/patients/${doc.patientId}/documents/${doc.id}`}
                      className="text-sm text-[#4fa77e] hover:underline font-medium"
                    >
                      Intake Form
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredIntakes.length === 0 && (
          <div className="p-8 text-center text-gray-500 text-sm">
            {searchTerm ? `No patients found matching "${searchTerm}"` : 'No intakes have been synced yet.'}
          </div>
        )}
      </div>
    </div>
  );
}