"use client";

import { useState } from "react";

interface PatientTagsProps {
  patientId: number;
  initialTags: string[];
}

export default function PatientTags({ patientId, initialTags }: PatientTagsProps) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getTagStyle = (tag: string) => {
    const tagLower = tag.toLowerCase();
    if (tagLower.includes('weightloss') || tagLower.includes('weight')) {
      return 'bg-[#efece7] text-gray-700 border-gray-300';
    } else if (tagLower.includes('english') || tagLower.includes('language')) {
      return 'bg-[#4fa77e] text-white border-[#4fa77e]';
    } else if (tagLower.includes('glp')) {
      return 'bg-rose-100 text-rose-700 border-rose-200';
    } else if (tagLower.includes('eonmeds')) {
      return 'bg-blue-100 text-blue-700 border-blue-200';
    }
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const removeTag = async (tag: string) => {
    setIsLoading(tag);
    setError(null);
    
    try {
      const response = await fetch(`/api/patients/${patientId}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove tag');
      }
      
      const data = await response.json();
      setTags(data.tags.map((t: string) => t.replace(/^#/, '')));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(null);
    }
  };

  const addTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    
    setIsLoading('adding');
    setError(null);
    
    try {
      const response = await fetch(`/api/patients/${patientId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: newTag.trim() }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add tag');
      }
      
      const data = await response.json();
      setTags(data.tags.map((t: string) => t.replace(/^#/, '')));
      setNewTag("");
      setIsAdding(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {tags.map((tag: string) => {
        const tagStyle = getTagStyle(tag);
        const isRemoving = isLoading === tag;
        
        return (
          <span
            key={tag}
            className={`group relative inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border ${tagStyle} ${isRemoving ? 'opacity-50' : ''}`}
          >
            #{tag}
            <button
              onClick={() => removeTag(tag)}
              disabled={isRemoving}
              className="w-5 h-5 rounded-full flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors"
              title="Remove tag"
            >
              {isRemoving ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </span>
        );
      })}
      
      {/* Add Tag Button/Form */}
      {isAdding ? (
        <form onSubmit={addTag} className="flex items-center gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="New tag..."
            autoFocus
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={isLoading === 'adding' || !newTag.trim()}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading === 'adding' ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => { setIsAdding(false); setNewTag(""); }}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 rounded-full text-sm font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add tag
        </button>
      )}
      
      {/* Error Message */}
      {error && (
        <div className="w-full mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
