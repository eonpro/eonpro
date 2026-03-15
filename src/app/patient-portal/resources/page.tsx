'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { ringColorStyle } from '@/lib/utils/css-ring-color';
import { BookOpen, Video, FileQuestion } from 'lucide-react';

const ResourcesTabContent = dynamic(
  () => import('@/components/patient-portal/resources/ResourcesTabContent'),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="aspect-video animate-pulse bg-gray-100" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    ),
  },
);

const categories = ['All', 'Tutorials', 'Education', 'Wellness', 'Nutrition', 'Fitness', 'Guides'];

export default function ResourcesPage() {
  const { branding } = useClinicBranding();
  const { language } = usePatientPortalLanguage();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeTab, setActiveTab] = useState<'videos' | 'articles' | 'faq'>('videos');

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Resources</h1>
        <p className="mt-1 text-gray-500">Educational videos, guides, and FAQs</p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-3 pl-4 pr-4 focus:outline-none focus:ring-2 focus:ring-opacity-50"
            style={ringColorStyle(primaryColor)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('videos')}
          className={`whitespace-nowrap rounded-xl px-4 py-2 font-medium transition-all ${
            activeTab === 'videos' ? 'text-white' : 'border border-gray-200 bg-white text-gray-600'
          }`}
          style={activeTab === 'videos' ? { backgroundColor: primaryColor } : {}}
        >
          <Video className="mr-2 inline h-4 w-4" />
          Video Tutorials
        </button>
        <button
          onClick={() => setActiveTab('articles')}
          className={`whitespace-nowrap rounded-xl px-4 py-2 font-medium transition-all ${
            activeTab === 'articles'
              ? 'text-white'
              : 'border border-gray-200 bg-white text-gray-600'
          }`}
          style={activeTab === 'articles' ? { backgroundColor: primaryColor } : {}}
        >
          <BookOpen className="mr-2 inline h-4 w-4" />
          Articles & Guides
        </button>
        <button
          onClick={() => setActiveTab('faq')}
          className={`whitespace-nowrap rounded-xl px-4 py-2 font-medium transition-all ${
            activeTab === 'faq' ? 'text-white' : 'border border-gray-200 bg-white text-gray-600'
          }`}
          style={activeTab === 'faq' ? { backgroundColor: primaryColor } : {}}
        >
          <FileQuestion className="mr-2 inline h-4 w-4" />
          FAQs
        </button>
      </div>

      {/* Category Filter (for videos/articles) */}
      {activeTab !== 'faq' && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                selectedCategory === category
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={selectedCategory === category ? { backgroundColor: primaryColor } : {}}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      <ResourcesTabContent
        activeTab={activeTab}
        searchQuery={searchQuery}
        selectedCategory={selectedCategory}
        primaryColor={primaryColor}
        subdomain={branding?.subdomain}
        resourceVideos={branding?.resourceVideos}
        language={language}
      />

      {/* Help Card */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <FileQuestion className="h-6 w-6" style={{ color: primaryColor }} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Can't find what you're looking for?</h3>
            <p className="mt-1 text-sm text-gray-600">
              Contact our support team and we'll be happy to help with any questions about your
              treatment or medication.
            </p>
            <button className="mt-3 text-sm font-medium" style={{ color: primaryColor }}>
              Contact Support →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
