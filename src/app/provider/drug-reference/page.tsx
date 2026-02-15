'use client';

import { useState } from 'react';
import { Search, BookOpen, Pill, AlertTriangle, Info } from 'lucide-react';

export default function DrugReferencePage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Drug Reference</h1>
        <p className="mt-1 text-gray-500">
          Search medications, interactions, and prescribing information
        </p>
      </div>

      {/* Search */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
          <input
            type="text"
            placeholder="Search medications by name, NDC, or ingredient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 text-lg focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
          />
        </div>
      </div>

      {/* Quick Access Categories */}
      <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500">
            <Pill className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-1 font-semibold text-gray-900">Common Medications</h3>
          <p className="text-sm text-gray-500">Quick access to frequently prescribed drugs</p>
        </div>

        <div className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-1 font-semibold text-gray-900">Drug Interactions</h3>
          <p className="text-sm text-gray-500">Check for potential drug-drug interactions</p>
        </div>

        <div className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-primary-light)]0">
            <Info className="h-6 w-6 text-white" />
          </div>
          <h3 className="mb-1 font-semibold text-gray-900">Dosing Guidelines</h3>
          <p className="text-sm text-gray-500">Recommended dosages and administration</p>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm">
        <BookOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
        <h3 className="mb-2 text-lg font-medium text-gray-900">Search for a Medication</h3>
        <p className="mx-auto max-w-md text-gray-500">
          Enter a drug name above to view detailed prescribing information, interactions,
          contraindications, and dosing guidelines.
        </p>
      </div>
    </div>
  );
}
