'use client';

import { useMemo, useState } from 'react';
import {
  Play,
  BookOpen,
  FileText,
  ExternalLink,
  Search,
  ChevronRight,
  Video,
  Download,
} from 'lucide-react';
import { normalizedIncludes } from '@/lib/utils/search';

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

const INJECTION_VIDEO = {
  en: {
    id: 'RUxd5uk_lAc',
    thumbnail: 'https://static.wixstatic.com/media/c49a9b_c5588b4357604ce39ae7ba80c6f83edd~mv2.webp',
    title: 'How to Safely Apply a Semaglutide Injection at Home',
    description:
      'Step-by-step guide from EONPro covering preparation, dosage, injection technique, and post-injection care.',
  },
  es: {
    id: 'ETqz2fmh5ww',
    thumbnail: 'https://static.wixstatic.com/media/c49a9b_bd7ba147288b4395a7a43faa4f0dd4d4~mv2.webp',
    title: 'Cómo aplicar una inyección de Semaglutida en casa de forma segura',
    description:
      'Guía paso a paso de EONPro sobre preparación, dosificación, técnica de inyección y cuidados posteriores.',
  },
} as const;

const INJECTION_VIDEO_CLINICS = ['eonmeds', 'wellmedr'];

const defaultResources: Resource[] = [
  {
    id: 'a-glp1',
    title: 'Understanding GLP-1 Medications',
    description: 'Learn how Semaglutide and Tirzepatide work for weight loss',
    type: 'article',
    category: 'Education',
    url: '/patient-portal/resources/understanding-glp1-medications',
  },
  {
    id: 'a-side-effects',
    title: 'Managing Side Effects',
    description: 'Tips for managing common side effects of weight loss medications',
    type: 'article',
    category: 'Wellness',
    url: '/patient-portal/resources/managing-side-effects',
  },
  {
    id: 'a-nutrition',
    title: 'Nutrition Guidelines for GLP-1 Patients',
    description: 'Dietary recommendations to maximize your weight loss results',
    type: 'article',
    category: 'Nutrition',
    url: '/patient-portal/resources/nutrition-guidelines',
  },
  {
    id: 'a-injection-site',
    title: 'Why You Might Notice Redness After Your Injection',
    description: 'Understanding injection site reactions and how to reduce discomfort',
    type: 'article',
    category: 'Wellness',
    url: '/patient-portal/resources/injection-site-reactions',
  },
  {
    id: 'a-exercise',
    title: 'Exercise Recommendations',
    description: 'Safe and effective exercise while on weight loss medication',
    type: 'article',
    category: 'Fitness',
    url: '/patient-portal/resources/exercise-recommendations',
  },
  {
    id: 'a-handbook',
    title: 'GLP-1 Patient Handbook',
    description: 'Complete medical & lifestyle guide to your weight loss journey — 14 sections',
    type: 'article',
    category: 'Guides',
    url: '/patient-portal/handbook',
  },
];

const faqs = [
  {
    id: 'f1',
    question: 'How should I store my medication?',
    answer:
      'Store your medication in the refrigerator between 36F to 46F (2C to 8C). Keep it away from the freezer compartment. Once in use, it can be kept at room temperature (up to 86F/30C) for up to 56 days.',
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

function getTypeIcon(type: string) {
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
}

export default function ResourcesTabContent({
  activeTab,
  searchQuery,
  selectedCategory,
  primaryColor,
  subdomain,
  resourceVideos,
  language = 'en',
}: {
  activeTab: 'videos' | 'articles' | 'faq';
  searchQuery: string;
  selectedCategory: string;
  primaryColor: string;
  subdomain?: string | null;
  resourceVideos?: Array<{
    id: string;
    title: string;
    description: string;
    url: string;
    thumbnail: string;
    category: string;
  }>;
  language?: 'en' | 'es';
}) {
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const resources = useMemo<Resource[]>(() => {
    const normalizedSubdomain = subdomain?.toLowerCase() ?? '';
    const vid = INJECTION_VIDEO[language] ?? INJECTION_VIDEO.en;
    const injectionVideo: Resource | null = INJECTION_VIDEO_CLINICS.includes(normalizedSubdomain)
      ? {
          id: 'v-injection-eon',
          title: vid.title,
          description: vid.description,
          type: 'video',
          category: 'Tutorials',
          url: `https://www.youtube.com/watch?v=${vid.id}`,
          thumbnail: vid.thumbnail,
          duration: '2:32',
        }
      : null;

    const clinicResources: Resource[] =
      resourceVideos && resourceVideos.length > 0
        ? resourceVideos.map((video) => ({
            id: video.id,
            title: video.title,
            description: video.description,
            type: 'video' as const,
            category: video.category || 'Tutorials',
            url: video.url,
            thumbnail: video.thumbnail,
          }))
        : [];

    return [...(injectionVideo ? [injectionVideo] : []), ...clinicResources, ...defaultResources];
  }, [resourceVideos, subdomain, language]);

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      normalizedIncludes(resource.title || '', searchQuery) ||
      normalizedIncludes(resource.description || '', searchQuery);
    const matchesCategory = selectedCategory === 'All' || resource.category === selectedCategory;
    const matchesTab =
      activeTab === 'videos'
        ? resource.type === 'video'
        : activeTab === 'articles'
          ? resource.type === 'article' || resource.type === 'pdf'
          : false;
    return matchesSearch && matchesCategory && matchesTab;
  });

  if (activeTab === 'faq') {
    return (
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
    );
  }

  return (
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
              {...(resource.url.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md"
            >
              {resource.type === 'video' && (
                <div className="relative aspect-video bg-gray-100">
                  {resource.thumbnail ? (
                    <img
                      src={resource.thumbnail}
                      alt={resource.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      width={320}
                      height={180}
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}10` }}
                    >
                      <Video className="h-12 w-12" style={{ color: primaryColor, opacity: 0.5 }} />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 transition-transform group-hover:scale-110">
                      <Play className="ml-1 h-6 w-6" style={{ color: primaryColor }} />
                    </div>
                  </div>
                  {resource.duration && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
                      {resource.duration}
                    </span>
                  )}
                </div>
              )}
              <div className="p-4">
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
                <div className="mt-3 flex items-center text-sm font-medium" style={{ color: primaryColor }}>
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
  );
}
