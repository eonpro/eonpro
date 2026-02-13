'use client';

import { useState } from 'react';
import {
  BookOpen,
  FileText,
  Video,
  Download,
  ExternalLink,
  Search,
  Star,
  Clock,
} from 'lucide-react';

interface Resource {
  id: string;
  title: string;
  category: 'training' | 'forms' | 'policies' | 'guides' | 'videos';
  description: string;
  lastUpdated: string;
  size?: string;
  duration?: string;
  downloads?: number;
  rating?: number;
  tags: string[];
}

export default function StaffResourcesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Mock resources
  const resources: Resource[] = [
    {
      id: '1',
      title: 'Patient Intake Procedures',
      category: 'training',
      description: 'Complete guide for processing new patient intakes',
      lastUpdated: '2024-01-20',
      size: '1.2 MB',
      downloads: 45,
      rating: 4.7,
      tags: ['Intake', 'New Patients', 'Procedures'],
    },
    {
      id: '2',
      title: 'HIPAA Compliance Training',
      category: 'videos',
      description: 'Essential HIPAA training for all staff members',
      lastUpdated: '2024-01-15',
      duration: '30 min',
      downloads: 89,
      rating: 4.9,
      tags: ['HIPAA', 'Compliance', 'Training'],
    },
    {
      id: '3',
      title: 'Insurance Verification Form',
      category: 'forms',
      description: 'Standard form for verifying patient insurance',
      lastUpdated: '2024-01-25',
      size: '250 KB',
      downloads: 156,
      rating: 4.3,
      tags: ['Insurance', 'Forms', 'Verification'],
    },
    {
      id: '4',
      title: 'Emergency Protocols',
      category: 'policies',
      description: 'Emergency response procedures for medical situations',
      lastUpdated: '2024-01-18',
      size: '890 KB',
      downloads: 67,
      rating: 5.0,
      tags: ['Emergency', 'Safety', 'Protocols'],
    },
    {
      id: '5',
      title: 'EHR System Guide',
      category: 'guides',
      description: 'Complete guide for using the electronic health records system',
      lastUpdated: '2024-01-22',
      size: '3.5 MB',
      downloads: 234,
      rating: 4.6,
      tags: ['EHR', 'Systems', 'Technology'],
    },
    {
      id: '6',
      title: 'Customer Service Excellence',
      category: 'training',
      description: 'Best practices for patient interaction and service',
      lastUpdated: '2024-01-10',
      size: '1.8 MB',
      downloads: 78,
      rating: 4.5,
      tags: ['Customer Service', 'Communication', 'Training'],
    },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'training':
        return <BookOpen className="h-5 w-5" />;
      case 'forms':
        return <FileText className="h-5 w-5" />;
      case 'videos':
        return <Video className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'training':
        return 'bg-blue-100 text-blue-800';
      case 'forms':
        return 'bg-green-100 text-green-800';
      case 'videos':
        return 'bg-purple-100 text-purple-800';
      case 'policies':
        return 'bg-red-100 text-red-800';
      case 'guides':
        return 'bg-yellow-100 text-yellow-800';
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

  const categories = ['all', 'training', 'forms', 'policies', 'guides', 'videos'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BookOpen className="h-6 w-6" />
            Staff Resources
          </h1>
          <button className="rounded-lg bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-700">
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
              className="w-full rounded-lg border py-2 pl-10 pr-4 focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="mt-4 flex gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`rounded-lg px-4 py-2 capitalize ${
                selectedCategory === category
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-cyan-600">{resources.length}</div>
          <div className="text-sm text-gray-600">Total Resources</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {resources.filter((r) => r.category === 'training').length}
          </div>
          <div className="text-sm text-gray-600">Training Materials</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">
            {resources.filter((r) => r.category === 'forms').length}
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {filteredResources.map((resource) => (
          <div
            key={resource.id}
            className="rounded-lg bg-white shadow transition-shadow hover:shadow-md"
          >
            <div className="p-6">
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

                  <div className="mt-4 flex gap-2">
                    <button className="flex flex-1 items-center justify-center gap-2 rounded bg-cyan-100 px-4 py-2 text-cyan-700 hover:bg-cyan-200">
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                    <button className="rounded bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200">
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
        <h3 className="mb-2 font-semibold text-cyan-900">Quick Links</h3>
        <div className="grid grid-cols-3 gap-2">
          <button className="text-left text-sm text-cyan-700 hover:text-cyan-900">
            • Employee Handbook
          </button>
          <button className="text-left text-sm text-cyan-700 hover:text-cyan-900">
            • IT Support
          </button>
          <button className="text-left text-sm text-cyan-700 hover:text-cyan-900">
            • Schedule Templates
          </button>
          <button className="text-left text-sm text-cyan-700 hover:text-cyan-900">
            • Benefits Information
          </button>
          <button className="text-left text-sm text-cyan-700 hover:text-cyan-900">
            • Safety Procedures
          </button>
          <button className="text-left text-sm text-cyan-700 hover:text-cyan-900">
            • Training Calendar
          </button>
        </div>
      </div>
    </div>
  );
}
