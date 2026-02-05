"use client";

/**
 * Photo Comparison Component
 *
 * Before/after slider for comparing progress photos:
 * - Interactive slider to reveal before/after
 * - Touch and mouse support
 * - Side-by-side mode option
 * - Weight and date display
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Calendar,
  Scale,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  SplitSquareHorizontal,
  Layers,
  X,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

// =============================================================================
// Types
// =============================================================================

interface ComparisonPhoto {
  id: number;
  s3Url: string | null;
  thumbnailUrl?: string | null;
  takenAt: string;
  weight: number | null;
  type: string;
  title?: string | null;
}

interface PhotoComparisonProps {
  beforePhoto: ComparisonPhoto;
  afterPhoto: ComparisonPhoto;
  onClose?: () => void;
  showFullscreen?: boolean;
  className?: string;
}

type ViewMode = 'slider' | 'side-by-side' | 'overlay';

// =============================================================================
// Helpers
// =============================================================================

function formatWeight(weight: number | null): string {
  if (!weight) return '--';
  return `${weight.toFixed(1)} lbs`;
}

function calculateWeightChange(before: number | null, after: number | null): {
  change: number;
  percentage: number;
  direction: 'loss' | 'gain' | 'none';
} {
  if (!before || !after) return { change: 0, percentage: 0, direction: 'none' };
  const change = after - before;
  const percentage = (Math.abs(change) / before) * 100;
  return {
    change: Math.abs(change),
    percentage,
    direction: change < 0 ? 'loss' : change > 0 ? 'gain' : 'none',
  };
}

// =============================================================================
// Slider Component
// =============================================================================

interface SliderViewProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
}

function SliderView({ beforeUrl, afterUrl, beforeLabel, afterLabel }: SliderViewProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateSliderPosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateSliderPosition(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      updateSliderPosition(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    updateSliderPosition(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging) {
      updateSliderPosition(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[3/4] sm:aspect-square overflow-hidden rounded-xl cursor-ew-resize select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* After Image (Background) */}
      <img
        src={afterUrl}
        alt="After"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Before Image (Clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        <img
          src={beforeUrl}
          alt="Before"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ width: `${containerRef.current?.offsetWidth || 100}px` }}
          draggable={false}
        />
      </div>

      {/* Slider Handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center">
          <ChevronLeft className="h-4 w-4 text-gray-600 -mr-1" />
          <ChevronRight className="h-4 w-4 text-gray-600 -ml-1" />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm font-medium">
        {beforeLabel}
      </div>
      <div className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm font-medium">
        {afterLabel}
      </div>
    </div>
  );
}

// =============================================================================
// Side by Side Component
// =============================================================================

interface SideBySideViewProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel: string;
  afterLabel: string;
  beforeDate: string;
  afterDate: string;
  beforeWeight: number | null;
  afterWeight: number | null;
}

function SideBySideView({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
  beforeDate,
  afterDate,
  beforeWeight,
  afterWeight,
}: SideBySideViewProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4">
      {/* Before */}
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100">
        <img src={beforeUrl} alt="Before" className="w-full h-full object-cover" />
        <div className="absolute top-3 left-3 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm font-medium">
          {beforeLabel}
        </div>
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <p className="text-white text-sm font-medium">{format(parseISO(beforeDate), 'MMM d, yyyy')}</p>
          {beforeWeight && (
            <p className="text-white/80 text-xs">{formatWeight(beforeWeight)}</p>
          )}
        </div>
      </div>

      {/* After */}
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100">
        <img src={afterUrl} alt="After" className="w-full h-full object-cover" />
        <div className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm font-medium">
          {afterLabel}
        </div>
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <p className="text-white text-sm font-medium">{format(parseISO(afterDate), 'MMM d, yyyy')}</p>
          {afterWeight && (
            <p className="text-white/80 text-xs">{formatWeight(afterWeight)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Overlay Component
// =============================================================================

interface OverlayViewProps {
  beforeUrl: string;
  afterUrl: string;
}

function OverlayView({ beforeUrl, afterUrl }: OverlayViewProps) {
  const [opacity, setOpacity] = useState(50);

  return (
    <div className="space-y-4">
      <div className="relative aspect-[3/4] sm:aspect-square rounded-xl overflow-hidden bg-gray-100">
        {/* Before Image */}
        <img
          src={beforeUrl}
          alt="Before"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* After Image with opacity */}
        <img
          src={afterUrl}
          alt="After"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: opacity / 100 }}
        />

        {/* Labels */}
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm">
          Before
        </div>
        <div className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 rounded-full text-white text-sm">
          After
        </div>
      </div>

      {/* Opacity Slider */}
      <div className="flex items-center gap-4 px-4">
        <span className="text-sm text-gray-500 w-16">Before</span>
        <input
          type="range"
          min="0"
          max="100"
          value={opacity}
          onChange={(e) => setOpacity(parseInt(e.target.value))}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-sm text-gray-500 w-16 text-right">After</span>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PhotoComparison({
  beforePhoto,
  afterPhoto,
  onClose,
  showFullscreen = false,
  className = '',
}: PhotoComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('slider');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const weightChange = calculateWeightChange(beforePhoto.weight, afterPhoto.weight);

  const beforeUrl = beforePhoto.s3Url;
  const afterUrl = afterPhoto.s3Url;

  if (!beforeUrl || !afterUrl) {
    return (
      <div className={`flex items-center justify-center p-8 bg-gray-100 rounded-xl ${className}`}>
        <p className="text-gray-500">Photos not available</p>
      </div>
    );
  }

  const content = (
    <div className={`space-y-4 ${isFullscreen ? '' : className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">Progress Comparison</h3>
          {weightChange.direction !== 'none' && (
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm ${
                weightChange.direction === 'loss'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-orange-100 text-orange-700'
              }`}
            >
              {weightChange.direction === 'loss' ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              <span>{weightChange.change.toFixed(1)} lbs</span>
              <span className="text-xs opacity-70">({weightChange.percentage.toFixed(1)}%)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Buttons */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('slider')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'slider' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
              }`}
              title="Slider view"
            >
              <Layers className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'side-by-side' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
              }`}
              title="Side by side"
            >
              <SplitSquareHorizontal className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('overlay')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'overlay' ? 'bg-white shadow-sm' : 'hover:bg-gray-200'
              }`}
              title="Overlay"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>

          {/* Fullscreen / Close */}
          {showFullscreen && (
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Maximize2 className="h-5 w-5" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Comparison View */}
      {viewMode === 'slider' && (
        <SliderView
          beforeUrl={beforeUrl}
          afterUrl={afterUrl}
          beforeLabel="Before"
          afterLabel="After"
        />
      )}

      {viewMode === 'side-by-side' && (
        <SideBySideView
          beforeUrl={beforeUrl}
          afterUrl={afterUrl}
          beforeLabel="Before"
          afterLabel="After"
          beforeDate={beforePhoto.takenAt}
          afterDate={afterPhoto.takenAt}
          beforeWeight={beforePhoto.weight}
          afterWeight={afterPhoto.weight}
        />
      )}

      {viewMode === 'overlay' && (
        <OverlayView beforeUrl={beforeUrl} afterUrl={afterUrl} />
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">Before</span>
          </div>
          <p className="font-medium">{format(parseISO(beforePhoto.takenAt), 'MMM d, yyyy')}</p>
          {beforePhoto.weight && (
            <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
              <Scale className="h-3 w-3" />
              {formatWeight(beforePhoto.weight)}
            </div>
          )}
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">After</span>
          </div>
          <p className="font-medium">{format(parseISO(afterPhoto.takenAt), 'MMM d, yyyy')}</p>
          {afterPhoto.weight && (
            <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
              <Scale className="h-3 w-3" />
              {formatWeight(afterPhoto.weight)}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-auto">
        <div className="max-w-4xl mx-auto p-4 sm:p-6">{content}</div>
      </div>
    );
  }

  return content;
}

export default PhotoComparison;
