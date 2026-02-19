'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Play, Clock, Star, Filter } from 'lucide-react';

interface Video {
  id: string;
  title: string;
  duration: string;
  category: string;
  thumbnail: string;
  rating: number;
  views: number;
}

export default function TutorialVideosPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', label: 'All', color: 'bg-gray-500' },
    { id: 'injection', label: 'Injections', color: 'bg-blue-500' },
    { id: 'exercise', label: 'Exercise', color: 'bg-green-500' },
    { id: 'nutrition', label: 'Nutrition', color: 'bg-[var(--brand-primary)]' },
    { id: 'wellness', label: 'Wellness', color: 'bg-pink-500' },
  ];

  const videos: Video[] = [
    {
      id: '1',
      title: 'How to Inject Semaglutide',
      duration: '5:30',
      category: 'injection',
      thumbnail: '/api/placeholder/400/225',
      rating: 4.8,
      views: 1250,
    },
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

  return (
    <div className="min-h-screen bg-[var(--brand-primary-light)]">
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

      {/* Featured Video */}
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-500 p-6 text-white">
          <h2 className="mb-2 text-xl font-semibold">Featured: Weight Loss Journey</h2>
          <p className="mb-4 text-sm text-orange-100">Get started from anywhere</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/20 p-4 backdrop-blur">
              <div className="relative mb-2 aspect-video overflow-hidden rounded-lg bg-black/20">
                <Play className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white/80" />
              </div>
              <p className="text-sm font-medium">Beginner Exercises</p>
              <p className="text-xs text-orange-100">2 min</p>
            </div>
            <div className="rounded-xl bg-white/20 p-4 backdrop-blur">
              <div className="relative mb-2 aspect-video overflow-hidden rounded-lg bg-black/20">
                <Play className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white/80" />
              </div>
              <p className="text-sm font-medium">Advanced Moves</p>
              <p className="text-xs text-orange-100">3 min</p>
            </div>
          </div>
        </div>

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
                className="rounded-xl bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-gray-200">
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
