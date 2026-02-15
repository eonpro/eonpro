'use client';

import { useState } from 'react';
import { Book, Search, FileText, Video, Download, ExternalLink } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  category: string;
  type: 'article' | 'video' | 'pdf';
  views: number;
  helpful: number;
  lastUpdated: string;
  description: string;
}

const mockArticles: Article[] = [
  {
    id: '1',
    title: 'Getting Started with EONPRO Platform',
    category: 'Getting Started',
    type: 'article',
    views: 1234,
    helpful: 456,
    lastUpdated: '2024-01-15',
    description: 'Learn the basics of navigating and using the EONPRO telehealth platform.',
  },
  {
    id: '2',
    title: 'How to Schedule an Appointment',
    category: 'Appointments',
    type: 'video',
    views: 890,
    helpful: 321,
    lastUpdated: '2024-01-20',
    description: 'Step-by-step video guide on scheduling appointments with providers.',
  },
  {
    id: '3',
    title: 'HIPAA Compliance Guide',
    category: 'Compliance',
    type: 'pdf',
    views: 567,
    helpful: 234,
    lastUpdated: '2024-01-10',
    description: 'Comprehensive guide to HIPAA compliance features in EONPRO.',
  },
  {
    id: '4',
    title: 'Billing and Insurance FAQ',
    category: 'Billing',
    type: 'article',
    views: 2345,
    helpful: 987,
    lastUpdated: '2024-01-25',
    description: 'Frequently asked questions about billing, insurance, and payments.',
  },
  {
    id: '5',
    title: 'Telemedicine Best Practices',
    category: 'Best Practices',
    type: 'article',
    views: 432,
    helpful: 189,
    lastUpdated: '2024-01-18',
    description: 'Best practices for conducting effective telemedicine consultations.',
  },
  {
    id: '6',
    title: 'Patient Portal Tutorial',
    category: 'Getting Started',
    type: 'video',
    views: 1567,
    helpful: 678,
    lastUpdated: '2024-01-22',
    description: 'Complete tutorial on using the patient portal features.',
  },
];

const categories = [
  'All',
  'Getting Started',
  'Appointments',
  'Billing',
  'Compliance',
  'Best Practices',
];

export default function KnowledgeBasePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [articles, setArticles] = useState<Article[]>(mockArticles);

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video className="h-5 w-5 text-[var(--brand-primary)]" />;
      case 'pdf':
        return <Download className="h-5 w-5 text-red-600" />;
      default:
        return <FileText className="h-5 w-5 text-blue-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center">
          <Book className="mr-3 h-8 w-8 text-blue-600" />
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
        </div>
        <p className="text-gray-600">
          Find answers, guides, and resources to help you use EONPRO effectively
        </p>
      </div>

      {/* Search and Filters */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search articles, videos, and guides..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-lg px-4 py-2 transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Popular Articles */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Most Viewed</h2>
          <div className="space-y-3">
            {articles
              .sort((a, b) => b.views - a.views)
              .slice(0, 3)
              .map((article) => (
                <div
                  key={article.id}
                  className="flex cursor-pointer items-start gap-3 rounded p-3 hover:bg-gray-50"
                >
                  {getTypeIcon(article.type)}
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{article.title}</h3>
                    <p className="text-sm text-gray-500">{article.views.toLocaleString()} views</p>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Most Helpful</h2>
          <div className="space-y-3">
            {articles
              .sort((a, b) => b.helpful - a.helpful)
              .slice(0, 3)
              .map((article) => (
                <div
                  key={article.id}
                  className="flex cursor-pointer items-start gap-3 rounded p-3 hover:bg-gray-50"
                >
                  {getTypeIcon(article.type)}
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{article.title}</h3>
                    <p className="text-sm text-gray-500">{article.helpful} found helpful</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Articles List */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b p-6">
          <h2 className="text-lg font-semibold">All Articles ({filteredArticles.length})</h2>
        </div>
        <div className="divide-y">
          {filteredArticles.map((article) => (
            <div key={article.id} className="cursor-pointer p-6 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    {getTypeIcon(article.type)}
                    <h3 className="text-lg font-medium text-gray-900 hover:text-blue-600">
                      {article.title}
                    </h3>
                  </div>
                  <p className="mb-3 text-gray-600">{article.description}</p>
                  <div className="flex items-center gap-6 text-sm text-gray-500">
                    <span className="rounded bg-gray-100 px-2 py-1">{article.category}</span>
                    <span>{article.views.toLocaleString()} views</span>
                    <span>{article.helpful} helpful</span>
                    <span>Updated {new Date(article.lastUpdated).toLocaleDateString()}</span>
                  </div>
                </div>
                <ExternalLink className="ml-4 h-5 w-5 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
