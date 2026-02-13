'use client';

import { useState, useEffect } from 'react';
import { useClinicBranding, usePortalFeatures } from '@/lib/contexts/ClinicBrandingContext';
import { ringColorStyle } from '@/lib/utils/css-ring-color';
import {
  Play,
  BookOpen,
  FileText,
  ExternalLink,
  Search,
  ChevronRight,
  Video,
  FileQuestion,
  Download,
} from 'lucide-react';

interface Resource {
  id: string;
  title: string;
  description: string;
  type: 'video' | 'article' | 'pdf' | 'faq';
  category: string;
  url: string;
  thumbnail?: string;
  duration?: string;
}

const defaultResources: Resource[] = [
  {
    id: 'v1',
    title: 'How to Self-Inject: Complete Guide',
    description: 'Step-by-step video guide for subcutaneous injection technique',
    type: 'video',
    category: 'Tutorials',
    url: 'https://www.youtube.com/watch?v=example1',
    thumbnail: '/images/injection-guide-thumb.jpg',
    duration: '8:45',
  },
  {
    id: 'v2',
    title: 'Understanding GLP-1 Medications',
    description: 'Learn how Semaglutide and Tirzepatide work for weight loss',
    type: 'video',
    category: 'Education',
    url: 'https://www.youtube.com/watch?v=example2',
    thumbnail: '/images/glp1-education-thumb.jpg',
    duration: '12:30',
  },
  {
    id: 'v3',
    title: 'Managing Side Effects',
    description: 'Tips for managing common side effects of weight loss medications',
    type: 'video',
    category: 'Tutorials',
    url: 'https://www.youtube.com/watch?v=example3',
    thumbnail: '/images/side-effects-thumb.jpg',
    duration: '6:15',
  },
  {
    id: 'a1',
    title: 'Nutrition Guidelines for GLP-1 Patients',
    description: 'Dietary recommendations to maximize your weight loss results',
    type: 'article',
    category: 'Nutrition',
    url: '/resources/nutrition-guidelines',
  },
  {
    id: 'a2',
    title: 'Exercise Recommendations',
    description: 'Safe and effective exercise while on weight loss medication',
    type: 'article',
    category: 'Fitness',
    url: '/resources/exercise-recommendations',
  },
  {
    id: 'p1',
    title: 'Patient Handbook',
    description: 'Complete guide to your weight loss program',
    type: 'pdf',
    category: 'Guides',
    url: '/resources/patient-handbook.pdf',
  },
];

const faqs = [
  {
    id: 'f1',
    question: 'How should I store my medication?',
    answer:
      'Store your medication in the refrigerator between 36°F to 46°F (2°C to 8°C). Keep it away from the freezer compartment. Once in use, it can be kept at room temperature (up to 86°F/30°C) for up to 56 days.',
  },
  {
    id: 'f2',
    question: 'What should I do if I miss a dose?',
    answer:
      'If you miss a dose and your next scheduled dose is more than 48 hours away, take the missed dose as soon as you remember. If your next dose is less than 48 hours away, skip the missed dose and take your next dose at the regular time.',
  },
  {
    id: 'f3',
    question: 'What are common side effects?',
    answer:
      'Common side effects include nausea, vomiting, diarrhea, constipation, and stomach pain. These usually improve as your body adjusts to the medication. Contact your provider if symptoms are severe or persistent.',
  },
  {
    id: 'f4',
    question: 'Can I drink alcohol while on this medication?',
    answer:
      'While moderate alcohol consumption is generally acceptable, alcohol can increase the risk of low blood sugar and may worsen nausea. We recommend limiting alcohol intake and discussing your specific situation with your provider.',
  },
  {
    id: 'f5',
    question: 'How long until I see results?',
    answer:
      'Most patients begin to notice weight loss within the first few weeks. Significant results are typically seen after 2-3 months of consistent use combined with diet and lifestyle changes.',
  },
];

const categories = ['All', 'Tutorials', 'Education', 'Nutrition', 'Fitness', 'Guides'];

export default function ResourcesPage() {
  const { branding } = useClinicBranding();
  const features = usePortalFeatures();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [resources, setResources] = useState<Resource[]>(defaultResources);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'videos' | 'articles' | 'faq'>('videos');

  useEffect(() => {
    // Load clinic-specific resources if available
    if (branding?.resourceVideos && branding.resourceVideos.length > 0) {
      const clinicResources: Resource[] = branding.resourceVideos.map((video) => ({
        id: video.id,
        title: video.title,
        description: video.description,
        type: 'video' as const,
        category: video.category || 'Tutorials',
        url: video.url,
        thumbnail: video.thumbnail,
      }));
      setResources([...clinicResources, ...defaultResources]);
    }
  }, [branding]);

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      searchQuery === '' ||
      resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'All' || resource.category === selectedCategory;

    const matchesTab =
      activeTab === 'videos'
        ? resource.type === 'video'
        : activeTab === 'articles'
          ? resource.type === 'article' || resource.type === 'pdf'
          : false;

    return matchesSearch && matchesCategory && matchesTab;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return Video;
      case 'article':
        return BookOpen;
      case 'pdf':
        return Download;
      default:
        return FileText;
    }
  };

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
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-opacity-50"
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

      {/* Content */}
      {activeTab === 'faq' ? (
        /* FAQ Section */
        <div className="space-y-3">
          {faqs.map((faq) => (
            <div
              key={faq.id}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <button
                onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                className="flex w-full items-center justify-between p-5 text-left"
              >
                <span className="pr-4 font-semibold text-gray-900">{faq.question}</span>
                <ChevronRight
                  className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${
                    expandedFaq === faq.id ? 'rotate-90' : ''
                  }`}
                />
              </button>
              {expandedFaq === faq.id && (
                <div className="px-5 pb-5 pt-0">
                  <p className="leading-relaxed text-gray-600">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Videos & Articles Grid */
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredResources.length === 0 ? (
            <div className="col-span-full py-12 text-center">
              <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-gray-500">No resources found</p>
              <p className="mt-1 text-sm text-gray-400">Try adjusting your search or filters</p>
            </div>
          ) : (
            filteredResources.map((resource) => {
              const TypeIcon = getTypeIcon(resource.type);

              return (
                <a
                  key={resource.id}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md"
                >
                  {/* Thumbnail for videos */}
                  {resource.type === 'video' && (
                    <div className="relative aspect-video bg-gray-100">
                      {resource.thumbnail ? (
                        <img
                          src={resource.thumbnail}
                          alt={resource.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center"
                          style={{ backgroundColor: `${primaryColor}10` }}
                        >
                          <Video
                            className="h-12 w-12"
                            style={{ color: primaryColor, opacity: 0.5 }}
                          />
                        </div>
                      )}
                      {/* Play button overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 transition-transform group-hover:scale-110">
                          <Play className="ml-1 h-6 w-6" style={{ color: primaryColor }} />
                        </div>
                      </div>
                      {/* Duration badge */}
                      {resource.duration && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
                          {resource.duration}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="p-4">
                    {/* Category & Type badge */}
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
                      >
                        {resource.category}
                      </span>
                      {resource.type !== 'video' && <TypeIcon className="h-4 w-4 text-gray-400" />}
                    </div>

                    <h3 className="mb-1 line-clamp-2 font-semibold text-gray-900 group-hover:text-opacity-80">
                      {resource.title}
                    </h3>
                    <p className="line-clamp-2 text-sm text-gray-500">{resource.description}</p>

                    <div
                      className="mt-3 flex items-center text-sm font-medium"
                      style={{ color: primaryColor }}
                    >
                      {resource.type === 'video'
                        ? 'Watch Video'
                        : resource.type === 'pdf'
                          ? 'Download PDF'
                          : 'Read Article'}
                      <ExternalLink className="ml-1 h-4 w-4" />
                    </div>
                  </div>
                </a>
              );
            })
          )}
        </div>
      )}

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
