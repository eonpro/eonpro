'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, Play, Clock, Star, X, Syringe } from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

const INJECTION_VIDEO_ID = 'RUxd5uk_lAc';
const INJECTION_VIDEO_CLINICS = ['eonmeds', 'wellmedr'];

interface Video {
  id: string;
  title: string;
  duration: string;
  category: string;
  thumbnail: string;
  youtubeId?: string;
  rating: number;
  views: number;
}

export default function TutorialVideosPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const { branding } = useClinicBranding();

  const subdomain = branding?.subdomain?.toLowerCase() ?? '';
  const showInjectionVideo = INJECTION_VIDEO_CLINICS.includes(subdomain);
  const primaryColor = branding?.primaryColor || '#f97316';

  const categories = [
    { id: 'all', label: 'All', color: 'bg-gray-500' },
    { id: 'injection', label: 'Injections', color: 'bg-blue-500' },
    { id: 'exercise', label: 'Exercise', color: 'bg-green-500' },
    { id: 'nutrition', label: 'Nutrition', color: 'bg-[var(--brand-primary)]' },
    { id: 'wellness', label: 'Wellness', color: 'bg-pink-500' },
  ];

  const videos: Video[] = [
    ...(showInjectionVideo
      ? [
          {
            id: 'eon-inject',
            title: 'How to Safely Apply a Semaglutide Injection at Home',
            duration: '2:32',
            category: 'injection',
            thumbnail: `https://img.youtube.com/vi/${INJECTION_VIDEO_ID}/mqdefault.jpg`,
            youtubeId: INJECTION_VIDEO_ID,
            rating: 4.9,
            views: 2100,
          },
        ]
      : []),
    {
      id: '2',
      title: 'Morning Yoga for Beginners',
      duration: '15:00',
      category: 'exercise',
      thumbnail: '/api/placeholder/400/225',
      rating: 4.9,
      views: 890,
    },
    {
      id: '3',
      title: 'Meal Prep Basics',
      duration: '12:45',
      category: 'nutrition',
      thumbnail: '/api/placeholder/400/225',
      rating: 4.7,
      views: 2100,
    },
    {
      id: '4',
      title: 'Strength Training at Home',
      duration: '20:00',
      category: 'exercise',
      thumbnail: '/api/placeholder/400/225',
      rating: 4.6,
      views: 1560,
    },
    {
      id: '5',
      title: 'Managing Side Effects',
      duration: '8:15',
      category: 'wellness',
      thumbnail: '/api/placeholder/400/225',
      rating: 4.9,
      views: 3200,
    },
    {
      id: '6',
      title: 'Proper Storage of Medication',
      duration: '3:20',
      category: 'injection',
      thumbnail: '/api/placeholder/400/225',
      rating: 4.8,
      views: 980,
    },
  ];

  const filteredVideos =
    selectedCategory === 'all' ? videos : videos.filter((v) => v.category === selectedCategory);

  const handlePlay = useCallback((video: Video) => {
    if (video.youtubeId) {
      setPlayingVideoId(video.youtubeId);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--brand-primary-light)]">
      {/* YouTube Player Modal */}
      {playingVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-3xl">
            <button
              onClick={() => setPlayingVideoId(null)}
              className="absolute -top-10 right-0 rounded-full p-1 text-white/80 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${playingVideoId}?autoplay=1&rel=0`}
                title="Tutorial Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/patient-portal" className="rounded-lg p-2 hover:bg-gray-100">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold">Tutorial Videos</h1>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? `${cat.color} text-white`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Featured Injection Video (eonmeds & wellmedr only) */}
        {showInjectionVideo && (selectedCategory === 'all' || selectedCategory === 'injection') && (
          <button
            onClick={() => setPlayingVideoId(INJECTION_VIDEO_ID)}
            className="mb-6 w-full overflow-hidden rounded-2xl text-left shadow-md transition-shadow hover:shadow-lg"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
          >
            <div className="relative">
              <img
                src={`https://img.youtube.com/vi/${INJECTION_VIDEO_ID}/maxresdefault.jpg`}
                alt="How to inject semaglutide"
                className="aspect-video w-full object-cover opacity-80"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${INJECTION_VIDEO_ID}/hqdefault.jpg`;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform hover:scale-110">
                  <Play className="ml-1 h-7 w-7" style={{ color: primaryColor }} />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                    <Syringe className="h-3 w-3" />
                    Featured Guide
                  </span>
                  <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs backdrop-blur-sm">
                    2:32
                  </span>
                </div>
                <h2 className="text-lg font-semibold leading-tight">
                  How to Safely Apply a Semaglutide Injection at Home
                </h2>
                <p className="mt-1 text-sm text-white/80">
                  Step-by-step guide from EON Medical + Wellness
                </p>
              </div>
            </div>
          </button>
        )}

        {/* Video List */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">
            {selectedCategory === 'all'
              ? 'All Videos'
              : categories.find((c) => c.id === selectedCategory)?.label}
          </h3>

          <div className="grid gap-4">
            {filteredVideos.map((video) => (
              <button
                key={video.id}
                onClick={() => handlePlay(video)}
                className="rounded-xl bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-gray-200">
                    {video.thumbnail && !video.thumbnail.startsWith('/api/placeholder') ? (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-br from-black/20 to-transparent" />
                    <Play className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-white" />
                    <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-xs text-white">
                      {video.duration}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <h4 className="mb-1 line-clamp-2 text-sm font-medium">{video.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {video.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 text-yellow-500" />
                        {video.rating}
                      </span>
                      <span>{video.views.toLocaleString()} views</span>
                    </div>
                    <span
                      className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                        categories.find((c) => c.id === video.category)?.color || 'bg-gray-500'
                      } text-white`}
                    >
                      {categories.find((c) => c.id === video.category)?.label}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
