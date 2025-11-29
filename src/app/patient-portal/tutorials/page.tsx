"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Play, Clock, Star, Filter } from "lucide-react";

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
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = [
    { id: "all", label: "All", color: "bg-gray-500" },
    { id: "injection", label: "Injections", color: "bg-blue-500" },
    { id: "exercise", label: "Exercise", color: "bg-green-500" },
    { id: "nutrition", label: "Nutrition", color: "bg-purple-500" },
    { id: "wellness", label: "Wellness", color: "bg-pink-500" },
  ];

  const videos: Video[] = [
    {
      id: "1",
      title: "How to Inject Semaglutide",
      duration: "5:30",
      category: "injection",
      thumbnail: "/api/placeholder/400/225",
      rating: 4.8,
      views: 1250,
    },
    {
      id: "2",
      title: "Morning Yoga for Beginners",
      duration: "15:00",
      category: "exercise",
      thumbnail: "/api/placeholder/400/225",
      rating: 4.9,
      views: 890,
    },
    {
      id: "3",
      title: "Meal Prep Basics",
      duration: "12:45",
      category: "nutrition",
      thumbnail: "/api/placeholder/400/225",
      rating: 4.7,
      views: 2100,
    },
    {
      id: "4",
      title: "Strength Training at Home",
      duration: "20:00",
      category: "exercise",
      thumbnail: "/api/placeholder/400/225",
      rating: 4.6,
      views: 1560,
    },
    {
      id: "5",
      title: "Managing Side Effects",
      duration: "8:15",
      category: "wellness",
      thumbnail: "/api/placeholder/400/225",
      rating: 4.9,
      views: 3200,
    },
    {
      id: "6",
      title: "Proper Storage of Medication",
      duration: "3:20",
      category: "injection",
      thumbnail: "/api/placeholder/400/225",
      rating: 4.8,
      views: 980,
    },
  ];

  const filteredVideos = selectedCategory === "all" 
    ? videos 
    : videos.filter(v => v.category === selectedCategory);

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/patient-portal" className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-semibold">Tutorial Videos</h1>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? `${cat.color} text-white`
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Featured Video */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl p-6 text-white mb-6">
          <h2 className="text-xl font-bold mb-2">Featured: Weight Loss Journey</h2>
          <p className="text-orange-100 text-sm mb-4">Get started from anywhere</p>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/20 backdrop-blur rounded-xl p-4">
              <div className="relative aspect-video bg-black/20 rounded-lg mb-2 overflow-hidden">
                <Play className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-white/80" />
              </div>
              <p className="text-sm font-medium">Beginner Exercises</p>
              <p className="text-xs text-orange-100">2 min</p>
            </div>
            <div className="bg-white/20 backdrop-blur rounded-xl p-4">
              <div className="relative aspect-video bg-black/20 rounded-lg mb-2 overflow-hidden">
                <Play className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-white/80" />
              </div>
              <p className="text-sm font-medium">Advanced Moves</p>
              <p className="text-xs text-orange-100">3 min</p>
            </div>
          </div>
        </div>

        {/* Video List */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">
            {selectedCategory === "all" ? "All Videos" : categories.find(c => c.id === selectedCategory)?.label}
          </h3>
          
          <div className="grid gap-4">
            {filteredVideos.map(video => (
              <button
                key={video.id}
                className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-left"
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="relative w-32 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-black/20 to-transparent" />
                    <Play className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-white" />
                    <span className="absolute bottom-1 right-1 text-xs text-white bg-black/50 px-1 rounded">
                      {video.duration}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm line-clamp-2 mb-1">{video.title}</h4>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {video.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        {video.rating}
                      </span>
                      <span>{video.views.toLocaleString()} views</span>
                    </div>
                    <span className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium ${
                      categories.find(c => c.id === video.category)?.color || "bg-gray-500"
                    } text-white`}>
                      {categories.find(c => c.id === video.category)?.label}
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
