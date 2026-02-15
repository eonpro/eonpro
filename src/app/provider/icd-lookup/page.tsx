'use client';

import { useState } from 'react';
import { Search, FileText, Tag, History } from 'lucide-react';

export default function IcdLookupPage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">ICD-10 Lookup</h1>
        <p className="mt-1 text-gray-500">Search diagnosis codes for accurate medical coding</p>
      </div>

      {/* Search */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
          <input
            type="text"
            placeholder="Search by code (e.g., E11.9) or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 text-lg focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          />
        </div>
      </div>

      {/* Quick Access */}
      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#4fa77e]">
            <History className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-1 font-semibold text-gray-900">Recent Codes</h3>
          <p className="text-sm text-gray-500">Quick access to your recently used codes</p>
        </div>

        <div className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500">
            <Tag className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-1 font-semibold text-gray-900">Common Diagnoses</h3>
          <p className="text-sm text-gray-500">Frequently used diagnosis codes</p>
        </div>

        <div className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-primary-light)]0">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-1 font-semibold text-gray-900">Browse Categories</h3>
          <p className="text-sm text-gray-500">Browse ICD-10 by chapter and category</p>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
        <Search className="mx-auto mb-4 h-16 w-16 text-gray-300" />
        <h3 className="mb-2 text-lg font-medium text-gray-900">Search for a Diagnosis Code</h3>
        <p className="mx-auto max-w-md text-gray-500">
          Enter a code or description above to find the correct ICD-10 diagnosis code for
          documentation and billing purposes.
        </p>
      </div>
    </div>
  );
}
