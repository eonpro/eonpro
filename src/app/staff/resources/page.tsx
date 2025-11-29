"use client";

import { useState } from "react";
import { BookOpen, FileText, Video, Download, ExternalLink, Search, Star, Clock } from "lucide-react";

interface Resource {
  id: string;
  title: string;
  category: "training" | "forms" | "policies" | "guides" | "videos";
  description: string;
  lastUpdated: string;
  size?: string;
  duration?: string;
  downloads?: number;
  rating?: number;
  tags: string[];
}

export default function StaffResourcesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Mock resources
  const resources: Resource[] = [
    {
      id: "1",
      title: "Patient Intake Procedures",
      category: "training",
      description: "Complete guide for processing new patient intakes",
      lastUpdated: "2024-01-20",
      size: "1.2 MB",
      downloads: 45,
      rating: 4.7,
      tags: ["Intake", "New Patients", "Procedures"]
    },
    {
      id: "2",
      title: "HIPAA Compliance Training",
      category: "videos",
      description: "Essential HIPAA training for all staff members",
      lastUpdated: "2024-01-15",
      duration: "30 min",
      downloads: 89,
      rating: 4.9,
      tags: ["HIPAA", "Compliance", "Training"]
    },
    {
      id: "3",
      title: "Insurance Verification Form",
      category: "forms",
      description: "Standard form for verifying patient insurance",
      lastUpdated: "2024-01-25",
      size: "250 KB",
      downloads: 156,
      rating: 4.3,
      tags: ["Insurance", "Forms", "Verification"]
    },
    {
      id: "4",
      title: "Emergency Protocols",
      category: "policies",
      description: "Emergency response procedures for medical situations",
      lastUpdated: "2024-01-18",
      size: "890 KB",
      downloads: 67,
      rating: 5.0,
      tags: ["Emergency", "Safety", "Protocols"]
    },
    {
      id: "5",
      title: "EHR System Guide",
      category: "guides",
      description: "Complete guide for using the electronic health records system",
      lastUpdated: "2024-01-22",
      size: "3.5 MB",
      downloads: 234,
      rating: 4.6,
      tags: ["EHR", "Systems", "Technology"]
    },
    {
      id: "6",
      title: "Customer Service Excellence",
      category: "training",
      description: "Best practices for patient interaction and service",
      lastUpdated: "2024-01-10",
      size: "1.8 MB",
      downloads: 78,
      rating: 4.5,
      tags: ["Customer Service", "Communication", "Training"]
    }
  ];

  const getCategoryIcon = (category: string) => {
    switch(category) {
      case "training": return <BookOpen className="h-5 w-5" />;
      case "forms": return <FileText className="h-5 w-5" />;
      case "videos": return <Video className="h-5 w-5" />;
      default: return <FileText className="h-5 w-5" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch(category) {
      case "training": return "bg-blue-100 text-blue-800";
      case "forms": return "bg-green-100 text-green-800";
      case "videos": return "bg-purple-100 text-purple-800";
      case "policies": return "bg-red-100 text-red-800";
      case "guides": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const filteredResources = resources.filter(resource => {
    const matchesSearch = resource.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          resource.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          resource.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || resource.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ["all", "training", "forms", "policies", "guides", "videos"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Staff Resources
          </h1>
          <button className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700">
            Request Resource
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 mt-4">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg capitalize ${
                selectedCategory === category
                  ? "bg-cyan-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-cyan-600">{resources.length}</div>
          <div className="text-sm text-gray-600">Total Resources</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">
            {resources.filter(r => r.category === "training").length}
          </div>
          <div className="text-sm text-gray-600">Training Materials</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">
            {resources.filter(r => r.category === "forms").length}
          </div>
          <div className="text-sm text-gray-600">Forms</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-purple-600">
            {resources.reduce((acc, r) => acc + (r.downloads || 0), 0)}
          </div>
          <div className="text-sm text-gray-600">Total Downloads</div>
        </div>
      </div>

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredResources.map((resource) => (
          <div key={resource.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${getCategoryColor(resource.category)}`}>
                  {getCategoryIcon(resource.category)}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{resource.title}</h3>
                  <p className="text-sm text-gray-600 mb-3">{resource.description}</p>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    {resource.tags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
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
                  
                  <div className="flex gap-2 mt-4">
                    <button className="flex-1 px-4 py-2 bg-cyan-100 text-cyan-700 rounded hover:bg-cyan-200 flex items-center justify-center gap-2">
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                    <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
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
      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
        <h3 className="font-semibold text-cyan-900 mb-2">Quick Links</h3>
        <div className="grid grid-cols-3 gap-2">
          <button className="text-sm text-cyan-700 hover:text-cyan-900 text-left">• Employee Handbook</button>
          <button className="text-sm text-cyan-700 hover:text-cyan-900 text-left">• IT Support</button>
          <button className="text-sm text-cyan-700 hover:text-cyan-900 text-left">• Schedule Templates</button>
          <button className="text-sm text-cyan-700 hover:text-cyan-900 text-left">• Benefits Information</button>
          <button className="text-sm text-cyan-700 hover:text-cyan-900 text-left">• Safety Procedures</button>
          <button className="text-sm text-cyan-700 hover:text-cyan-900 text-left">• Training Calendar</button>
        </div>
      </div>
    </div>
  );
}
