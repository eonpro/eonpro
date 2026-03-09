'use client';

import React, { useRef, useEffect, useState } from 'react';

interface DeviceFrameProps {
  device: 'mobile' | 'tablet' | 'desktop';
  children: React.ReactNode;
}

const DEVICE_DIMENSIONS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1024, height: 768 },
} as const;

export default function DeviceFrame({ device, children }: DeviceFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const { width, height } = DEVICE_DIMENSIONS[device];

  useEffect(() => {
    const el = containerRef.current;
    if (!el || device === 'desktop') return;

    const updateScale = () => {
      const parent = el.parentElement;
      if (!parent) return;
      const maxW = parent.clientWidth;
      const maxH = parent.clientHeight;
      const scaleW = maxW / width;
      const scaleH = maxH / height;
      const s = Math.min(1, scaleW, scaleH);
      setScale(s);
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el.parentElement ?? el);

    return () => ro.disconnect();
  }, [width, height, device]);

  const isMobile = device === 'mobile';
  const isTablet = device === 'tablet';
  const isDesktop = device === 'desktop';

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center min-h-0 w-full"
      style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
    >
      <div
        className="relative overflow-hidden rounded-xl border border-gray-300 bg-gray-100 shadow-xl"
        style={{
          width: isDesktop ? '100%' : width,
          height: isDesktop ? '100%' : height,
          minWidth: isDesktop ? '100%' : width,
          minHeight: isDesktop ? 400 : height,
        }}
      >
        {/* Browser-like top bar for desktop */}
        {isDesktop && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-gray-200 border-b border-gray-300">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 mx-4 flex items-center justify-center">
              <div className="flex-1 max-w-[400px] px-4 py-1.5 bg-white rounded-lg border border-gray-300 text-xs text-gray-500 truncate">
                /intake/form
              </div>
            </div>
          </div>
        )}

        {/* Mobile notch */}
        {isMobile && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-10" />
        )}

        {/* Scrollable content area */}
        <div className="w-full h-full overflow-auto bg-white">
          {isMobile && <div className="h-6 flex-shrink-0" />}
          {children}
          {isMobile && <div className="h-8 flex-shrink-0" />}
        </div>

        {/* Mobile home indicator */}
        {isMobile && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-400 rounded-full" />
        )}
      </div>
    </div>
  );
}
