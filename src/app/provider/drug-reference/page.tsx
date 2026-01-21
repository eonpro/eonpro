'use client';

import { useState } from 'react';
import { Search, BookOpen, Pill, AlertTriangle, Info } from 'lucide-react';

export default function DrugReferencePage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Drug Reference</h1>
        <p className="text-gray-500 mt-1">Search medications, interactions, and prescribing information</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search medications by name, NDC, or ingredient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e] text-lg"
          />
        </div>
      </div>

      {/* Quick Access Categories */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center mb-4">
            <Pill className="h-6 w-6 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Common Medications</h3>
          <p className="text-sm text-gray-500">Quick access to frequently prescribed drugs</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Drug Interactions</h3>
          <p className="text-sm text-gray-500">Check for potential drug-drug interactions</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center mb-4">
            <Info className="h-6 w-6 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Dosing Guidelines</h3>
          <p className="text-sm text-gray-500">Recommended dosages and administration</p>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
        <BookOpen className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Search for a Medication</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Enter a drug name above to view detailed prescribing information, 
          interactions, contraindications, and dosing guidelines.
        </p>
      </div>
    </div>
  );
}
