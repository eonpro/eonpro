'use client';

import { useState } from 'react';
import {
  BookOpen,
  FileText,
  Video,
  Download,
  ExternalLink,
  Search,
  Filter,
  Star,
  Clock,
} from 'lucide-react';

interface Resource {
  id: string;
  title: string;
  category: 'guideline' | 'form' | 'video' | 'article' | 'protocol';
  description: string;
  lastUpdated: string;
  size?: string;
  duration?: string;
  downloads?: number;
  rating?: number;
  tags: string[];
}

export default function ProviderResourcesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Mock resources
  const resources: Resource[] = [
    {
      id: '1',
      title: '2024 Hypertension Management Guidelines',
      category: 'guideline',
      description: 'Latest evidence-based guidelines for managing hypertension in primary care',
      lastUpdated: '2024-01-15',
      size: '2.4 MB',
      downloads: 156,
      rating: 4.8,
      tags: ['Cardiology', 'Primary Care', 'Guidelines'],
    },
    {
      id: '2',
      title: 'Diabetes Patient Education Video Series',
      category: 'video',
      description: 'Comprehensive video series for patient education on Type 2 diabetes management',
      lastUpdated: '2024-01-20',
      duration: '45 min',
      downloads: 89,
      rating: 4.6,
      tags: ['Diabetes', 'Patient Education', 'Video'],
    },
    {
      id: '3',
      title: 'Prior Authorization Form - Specialty Medications',
      category: 'form',
      description: 'Standard form for requesting prior authorization for specialty medications',
      lastUpdated: '2024-01-10',
      size: '156 KB',
      downloads: 234,
      rating: 4.2,
      tags: ['Forms', 'Insurance', 'Medications'],
    },
    {
      id: '4',
      title: 'Mental Health Screening Tools',
      category: 'protocol',
      description:
        'Collection of validated screening tools for depression, anxiety, and other mental health conditions',
      lastUpdated: '2024-01-18',
      size: '1.8 MB',
      downloads: 178,
      rating: 4.9,
      tags: ['Mental Health', 'Screening', 'Tools'],
    },
    {
      id: '5',
      title: 'Telehealth Best Practices',
      category: 'article',
      description: 'Evidence-based recommendations for conducting effective telehealth visits',
      lastUpdated: '2024-01-22',
      size: '890 KB',
      downloads: 67,
      rating: 4.5,
      tags: ['Telehealth', 'Technology', 'Best Practices'],
    },
    {
      id: '6',
      title: 'Pediatric Vaccination Schedule 2024',
      category: 'guideline',
      description: 'Updated CDC vaccination schedule for pediatric patients',
      lastUpdated: '2024-01-01',
      size: '450 KB',
      downloads: 312,
      rating: 5.0,
      tags: ['Pediatrics', 'Vaccines', 'CDC'],
    },
    {
      id: '7',
      title: 'SOAP Note Templates',
      category: 'form',
      description: 'Customizable SOAP note templates for various specialties',
      lastUpdated: '2024-01-25',
      size: '230 KB',
      downloads: 456,
      rating: 4.7,
      tags: ['Documentation', 'Templates', 'SOAP'],
    },
    {
      id: '8',
      title: 'Opioid Prescribing Guidelines',
      category: 'protocol',
      description: 'Safe prescribing practices and monitoring protocols for opioid medications',
      lastUpdated: '2024-01-12',
      size: '1.2 MB',
      downloads: 198,
      rating: 4.8,
      tags: ['Pain Management', 'Opioids', 'Safety'],
    },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'guideline':
        return <BookOpen className="h-5 w-5" />;
      case 'form':
        return <FileText className="h-5 w-5" />;
      case 'video':
        return <Video className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'guideline':
        return 'bg-blue-100 text-blue-800';
      case 'form':
        return 'bg-green-100 text-green-800';
      case 'video':
        return 'bg-purple-100 text-purple-800';
      case 'article':
        return 'bg-yellow-100 text-yellow-800';
      case 'protocol':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      resource.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resource.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resource.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || resource.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', 'guideline', 'form', 'video', 'article', 'protocol'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BookOpen className="h-6 w-6" />
            Provider Resources
          </h1>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
            Request Resource
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border py-2 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-lg px-4 py-2 capitalize ${
                  selectedCategory === category
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-indigo-600">{resources.length}</div>
          <div className="text-sm text-gray-600">Total Resources</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {resources.filter((r) => r.category === 'guideline').length}
          </div>
          <div className="text-sm text-gray-600">Guidelines</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">
            {resources.filter((r) => r.category === 'form').length}
          </div>
          <div className="text-sm text-gray-600">Forms</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-purple-600">
            {resources.reduce((acc, r) => acc + (r.downloads || 0), 0)}
          </div>
          <div className="text-sm text-gray-600">Total Downloads</div>
        </div>
      </div>

      {/* Resources Grid */}
      <div className="grid grid-cols-2 gap-6">
        {filteredResources.map((resource) => (
          <div
            key={resource.id}
            className="rounded-lg bg-white shadow transition-shadow hover:shadow-md"
          >
            <div className="p-6">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg p-2 ${getCategoryColor(resource.category)}`}>
                    {getCategoryIcon(resource.category)}
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-1 text-lg font-semibold">{resource.title}</h3>
                    <p className="mb-3 text-sm text-gray-600">{resource.description}</p>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {resource.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(resource.lastUpdated).toLocaleDateString()}
                      </span>
                      {resource.size && <span>{resource.size}</span>}
                      {resource.duration && <span>{resource.duration}</span>}
                      {resource.downloads && (
                        <span className="flex items-center gap-1">
                          <Download className="h-4 w-4" />
                          {resource.downloads}
                        </span>
                      )}
                      {resource.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {resource.rating}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex flex-1 items-center justify-center gap-2 rounded bg-indigo-100 px-4 py-2 text-indigo-700 hover:bg-indigo-200">
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button className="rounded bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">
                  <ExternalLink className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="mb-2 font-semibold text-blue-900">Quick Links</h3>
        <div className="grid grid-cols-3 gap-2">
          <button className="text-left text-sm text-blue-700 hover:text-blue-900">
            • CDC Guidelines
          </button>
          <button className="text-left text-sm text-blue-700 hover:text-blue-900">
            • Drug Database
          </button>
          <button className="text-left text-sm text-blue-700 hover:text-blue-900">
            • ICD-10 Codes
          </button>
          <button className="text-left text-sm text-blue-700 hover:text-blue-900">
            • CPT Codes
          </button>
          <button className="text-left text-sm text-blue-700 hover:text-blue-900">
            • Patient Handouts
          </button>
          <button className="text-left text-sm text-blue-700 hover:text-blue-900">
            • CME Resources
          </button>
        </div>
      </div>
    </div>
  );
}
