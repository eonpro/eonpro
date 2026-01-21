'use client';

import { useState } from 'react';
import { Search, FileText, Tag, History } from 'lucide-react';

export default function IcdLookupPage() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">ICD-10 Lookup</h1>
        <p className="text-gray-500 mt-1">Search diagnosis codes for accurate medical coding</p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by code (e.g., E11.9) or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e] text-lg"
          />
        </div>
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-[#4fa77e] flex items-center justify-center mb-4">
            <History className="h-6 w-6 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Recent Codes</h3>
          <p className="text-sm text-gray-500">Quick access to your recently used codes</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center mb-4">
            <Tag className="h-6 w-6 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Common Diagnoses</h3>
          <p className="text-sm text-gray-500">Frequently used diagnosis codes</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center mb-4">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Browse Categories</h3>
          <p className="text-sm text-gray-500">Browse ICD-10 by chapter and category</p>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
        <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Search for a Diagnosis Code</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Enter a code or description above to find the correct ICD-10 diagnosis code
          for documentation and billing purposes.
        </p>
      </div>
    </div>
  );
}
