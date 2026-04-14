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
      className="flex min-h-0 w-full items-center justify-center"
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
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-300 bg-gray-200 px-4 py-2.5">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-amber-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
            </div>
            <div className="mx-4 flex flex-1 items-center justify-center">
              <div className="max-w-[400px] flex-1 truncate rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-xs text-gray-500">
                /intake/form
              </div>
            </div>
          </div>
        )}

        {/* Mobile notch */}
        {isMobile && (
          <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-black" />
        )}

        {/* Scrollable content area */}
        <div className="h-full w-full overflow-auto bg-white">
          {isMobile && <div className="h-6 flex-shrink-0" />}
          {children}
          {isMobile && <div className="h-8 flex-shrink-0" />}
        </div>

        {/* Mobile home indicator */}
        {isMobile && (
          <div className="absolute bottom-2 left-1/2 h-1 w-32 -translate-x-1/2 rounded-full bg-gray-400" />
        )}
      </div>
    </div>
  );
}
