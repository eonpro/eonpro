'use client';

import { useState } from 'react';
import {
  Download,
  Image,
  Link as LinkIcon,
  FileText,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface Resource {
  id: string;
  type: 'banner' | 'text' | 'email' | 'social';
  name: string;
  description: string;
  content: string;
  previewUrl?: string;
  dimensions?: string;
}

const SAMPLE_RESOURCES: Resource[] = [
  {
    id: '1',
    type: 'banner',
    name: 'Main Banner - 728x90',
    description: 'Leaderboard banner for websites',
    content: 'https://example.com/banners/728x90.png',
    previewUrl: 'https://placehold.co/728x90/8B5CF6/white?text=Your+Brand+Banner',
    dimensions: '728 x 90',
  },
  {
    id: '2',
    type: 'banner',
    name: 'Square Banner - 300x250',
    description: 'Medium rectangle for sidebars',
    content: 'https://example.com/banners/300x250.png',
    previewUrl: 'https://placehold.co/300x250/8B5CF6/white?text=Your+Brand',
    dimensions: '300 x 250',
  },
  {
    id: '3',
    type: 'banner',
    name: 'Mobile Banner - 320x50',
    description: 'Mobile leaderboard',
    content: 'https://example.com/banners/320x50.png',
    previewUrl: 'https://placehold.co/320x50/8B5CF6/white?text=Brand',
    dimensions: '320 x 50',
  },
  {
    id: '4',
    type: 'text',
    name: 'Short Description',
    description: 'One-liner for social posts',
    content: 'Transform your health journey with personalized telehealth care. Get started today!',
  },
  {
    id: '5',
    type: 'text',
    name: 'Blog Intro',
    description: 'Paragraph for blog posts',
    content:
      'Looking for convenient, personalized healthcare? Our telehealth platform connects you with licensed providers who understand your unique needs. From weight management to wellness consultations, get the care you deserve from the comfort of home.',
  },
  {
    id: '6',
    type: 'email',
    name: 'Introduction Email',
    description: 'Email template for introducing the service',
    content: `Subject: A better way to manage your health

Hi [Name],

I wanted to share something that's been helping me take control of my health journey.

[Brand] offers personalized telehealth consultations with licensed providers. Whether you're interested in weight management, wellness optimization, or just want convenient access to healthcare, they make it easy.

Use my link to get started: [YOUR_LINK]

Let me know if you have questions!

[Your Name]`,
  },
  {
    id: '7',
    type: 'social',
    name: 'Instagram Caption',
    description: 'Caption for Instagram posts',
    content:
      '✨ Taking control of my health has never been easier! Loving my experience with telehealth consultations - personalized care from home 🏠💜 Link in bio to learn more! #telehealth #wellness #healthcare',
  },
  {
    id: '8',
    type: 'social',
    name: 'Twitter/X Post',
    description: 'Short post for Twitter/X',
    content:
      'Finally found a healthcare solution that fits my busy schedule. Telehealth consultations with real providers, personalized plans, all from home. Game changer! 🙌',
  },
];

export default function ResourcesPage() {
  const [filter, setFilter] = useState<'all' | 'banner' | 'text' | 'email' | 'social'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredResources =
    filter === 'all' ? SAMPLE_RESOURCES : SAMPLE_RESOURCES.filter((r) => r.type === filter);

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error('Failed to copy');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'banner':
        return Image;
      case 'text':
        return FileText;
      case 'email':
        return LinkIcon;
      case 'social':
        return Sparkles;
      default:
        return FileText;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'banner':
        return 'Banner';
      case 'text':
        return 'Text';
      case 'email':
        return 'Email';
      case 'social':
        return 'Social';
      default:
        return type;
    }
  };

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
        <p className="mt-1 text-gray-500">Marketing materials for your promotions</p>
      </div>

      {/* Tips Card */}
      <div className="mb-6 rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 flex-shrink-0 text-violet-600" />
          <div>
            <p className="font-medium text-gray-900">Pro Tips</p>
            <ul className="mt-1 text-sm text-gray-600">
              <li>• Always include your unique referral link in all promotions</li>
              <li>• Customize messages to match your audience's tone</li>
              <li>• Track which resources perform best using different ref codes</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {['all', 'banner', 'text', 'email', 'social'].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type as any)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filter === type
                ? 'bg-violet-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {type === 'all' ? 'All' : getTypeLabel(type)}
          </button>
        ))}
      </div>

      {/* Resources Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredResources.map((resource) => {
          const TypeIcon = getTypeIcon(resource.type);

          return (
            <div key={resource.id} className="rounded-xl bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-violet-100 p-1.5 text-violet-600">
                    <TypeIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{resource.name}</p>
                    <p className="text-xs text-gray-500">{resource.description}</p>
                  </div>
                </div>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {getTypeLabel(resource.type)}
                </span>
              </div>

              {/* Preview for banners */}
              {resource.type === 'banner' && resource.previewUrl && (
                <div className="mb-3 overflow-hidden rounded-lg border border-gray-200">
                  <img src={resource.previewUrl} alt={resource.name} className="w-full" />
                  {resource.dimensions && (
                    <div className="border-t border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
                      {resource.dimensions}
                    </div>
                  )}
                </div>
              )}

              {/* Content preview for text */}
              {resource.type !== 'banner' && (
                <div className="mb-3 max-h-32 overflow-hidden rounded-lg bg-gray-50 p-3">
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-gray-700">
                    {resource.content}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(resource.id, resource.content)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-50 py-2 text-sm font-medium text-violet-600 hover:bg-violet-100"
                >
                  {copiedId === resource.id ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
                {resource.type === 'banner' && (
                  <a
                    href={resource.previewUrl}
                    download
                    className="flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-gray-600 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredResources.length === 0 && (
        <div className="rounded-xl bg-white py-12 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No resources found</p>
        </div>
      )}

      {/* Custom Request */}
      <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Need Custom Materials?</h2>
        <p className="mb-4 text-gray-500">
          Contact your affiliate manager to request custom banners, landing pages, or other
          promotional materials.
        </p>
        <a
          href="/portal/affiliate/support"
          className="inline-flex items-center gap-2 text-violet-600 hover:text-violet-700"
        >
          Contact Support
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
