'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  BookOpen,
  AlertTriangle,
  Star,
  Menu,
  X,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  handbookTitle,
  handbookSubtitle,
  handbookSections,
} from '@/components/patient-portal/handbook/handbook-content';

function hexToHSL(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

const SECTION_ICONS: Record<number, string> = {
  1: '🔬',
  2: '📅',
  3: '💊',
  4: '💉',
  5: '⚡',
  6: '🥗',
  7: '💧',
  8: '🏃',
  9: '📊',
  10: '🎯',
  11: '🚨',
  12: '🤝',
  13: '❓',
  14: '✨',
};

function HeroBlobs({ color }: { color: string }) {
  const { h, s } = hexToHSL(color);
  const w1 = `hsl(${h}, ${Math.round(s * 55)}%, 91%)`;
  const w2 = `hsl(${(h + 20) % 360}, ${Math.round(s * 45)}%, 87%)`;
  const w3 = `hsl(${(h - 15 + 360) % 360}, ${Math.round(s * 35)}%, 94%)`;
  const ac = `hsl(${h}, ${Math.round(s * 65)}%, 80%)`;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg className="absolute -right-32 -top-24 h-[500px] w-[500px] opacity-60" viewBox="0 0 400 400" fill="none">
        <path d="M280,30 C370,70 410,190 370,280 C330,370 210,400 120,360 C30,320 -10,200 40,110 C90,20 190,-10 280,30Z" fill={w1} />
      </svg>
      <svg className="absolute -left-20 top-4 h-[380px] w-[380px] opacity-45" viewBox="0 0 320 320" fill="none">
        <ellipse cx="160" cy="160" rx="155" ry="125" fill={w2} />
      </svg>
      <svg className="absolute bottom-0 right-1/4 h-[200px] w-[200px] opacity-35" viewBox="0 0 160 160" fill="none">
        <circle cx="80" cy="80" r="74" fill={ac} />
      </svg>
      <svg className="absolute -bottom-8 left-1/4 h-[240px] w-[480px] opacity-25" viewBox="0 0 480 180" fill="none">
        <ellipse cx="240" cy="120" rx="230" ry="90" fill={w3} />
      </svg>
    </div>
  );
}

function SectionBlob({ color, index }: { color: string; index: number }) {
  const { h, s } = hexToHSL(color);
  const fill = `hsl(${(h + index * 12) % 360}, ${Math.round(s * 40)}%, 92%)`;

  const shapes = [
    <svg key="a" width="64" height="52" viewBox="0 0 64 52" fill="none"><path d="M44,2 C56,8 64,20 58,36 C52,48 34,52 20,46 C6,40 0,24 8,12 C16,0 32,-4 44,2Z" fill={fill} /></svg>,
    <svg key="b" width="56" height="56" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="26" fill={fill} /></svg>,
    <svg key="c" width="72" height="36" viewBox="0 0 72 36" fill="none"><rect width="72" height="36" rx="18" fill={fill} /></svg>,
    <svg key="d" width="52" height="52" viewBox="0 0 52 52" fill="none"><ellipse cx="26" cy="26" rx="25" ry="20" fill={fill} /></svg>,
  ];

  return (
    <div className="pointer-events-none absolute -right-4 -top-4 opacity-50" aria-hidden="true">
      {shapes[index % shapes.length]}
    </div>
  );
}

export default function HandbookPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const { h, s } = hexToHSL(primaryColor);

  const bgWarm = `hsl(${h}, ${Math.round(s * 28)}%, 97%)`;
  const borderSoft = `hsl(${h}, ${Math.round(s * 25)}%, 90%)`;
  const tocBg = `hsl(${h}, ${Math.round(s * 20)}%, 98.5%)`;

  const [activeSection, setActiveSection] = useState(handbookSections[0].id);
  const [tocOpen, setTocOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    );

    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = useCallback((id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTocOpen(false);
  }, []);

  const progressPercent = useMemo(() => {
    const idx = handbookSections.findIndex((sec) => sec.id === activeSection);
    return Math.round(((idx + 1) / handbookSections.length) * 100);
  }, [activeSection]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgWarm }}>
      {/* Top Navigation */}
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a
            href="/patient-portal/resources"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Resources</span>
            <span className="sm:hidden">Back</span>
          </a>

          {/* Progress indicator */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {progressPercent}% read
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 sm:w-32">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%`, backgroundColor: primaryColor }}
              />
            </div>
          </div>

          {/* Mobile TOC toggle */}
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium lg:hidden"
            style={{ backgroundColor: `${primaryColor}12`, color: primaryColor }}
          >
            {tocOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="hidden sm:inline">Contents</span>
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ borderBottom: `1px solid ${borderSoft}` }}>
        <HeroBlobs color={primaryColor} />

        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10 sm:pb-16 sm:pt-14">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Patient Handbook
              </span>
              <span className="rounded-full bg-white/60 px-3 py-1 text-xs text-gray-500 backdrop-blur-sm">
                14 Sections
              </span>
            </div>

            <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl lg:text-5xl">
              {handbookTitle}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">
              {handbookSubtitle}
            </p>

            <div className="mt-6 flex items-center gap-2" aria-hidden="true">
              <div className="h-1.5 w-20 rounded-full" style={{ backgroundColor: primaryColor, opacity: 0.6 }} />
              <div className="h-1.5 w-10 rounded-full" style={{ backgroundColor: primaryColor, opacity: 0.3 }} />
              <div className="h-1.5 w-5 rounded-full" style={{ backgroundColor: primaryColor, opacity: 0.15 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile TOC Drawer */}
      {tocOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setTocOpen(false)} />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[70vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Contents</h3>
              <button onClick={() => setTocOpen(false)} className="rounded-full p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <nav className="space-y-1">
              {handbookSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    activeSection === section.id
                      ? 'font-semibold text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={
                    activeSection === section.id
                      ? { backgroundColor: `${primaryColor}12`, color: primaryColor }
                      : undefined
                  }
                >
                  <span className="text-base">{SECTION_ICONS[section.number]}</span>
                  <span className="flex-1 truncate">{section.title}</span>
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {String(section.number).padStart(2, '0')}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-10">
        {/* Desktop Sidebar TOC */}
        <aside className="hidden w-72 flex-shrink-0 lg:block">
          <div
            className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border p-4"
            style={{ backgroundColor: tocBg, borderColor: borderSoft }}
          >
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
              Contents
            </h3>
            <nav className="space-y-0.5">
              {handbookSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-all ${
                    activeSection === section.id
                      ? 'font-semibold'
                      : 'text-gray-500 hover:bg-white/60 hover:text-gray-700'
                  }`}
                  style={
                    activeSection === section.id
                      ? { backgroundColor: `${primaryColor}15`, color: primaryColor }
                      : undefined
                  }
                >
                  <span className="text-sm">{SECTION_ICONS[section.number]}</span>
                  <span className="flex-1 truncate">{section.title}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          <div className="space-y-8">
            {handbookSections.map((section, sIdx) => {
              const isHighlight = section.id === 'red-flags' || section.id === 'final-message';
              const isLast = section.id === 'final-message';

              return (
                <section
                  key={section.id}
                  id={section.id}
                  ref={(el) => setSectionRef(section.id, el)}
                  className="scroll-mt-20"
                >
                  {/* Section header */}
                  <div
                    className="relative overflow-hidden rounded-t-2xl px-6 py-5 sm:px-8 sm:py-6"
                    style={{
                      backgroundColor: isHighlight
                        ? section.id === 'red-flags'
                          ? '#fef2f2'
                          : `${primaryColor}12`
                        : 'white',
                      borderBottom: `1px solid ${borderSoft}`,
                    }}
                  >
                    <SectionBlob color={primaryColor} index={sIdx} />

                    <div className="relative flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg"
                        style={{
                          backgroundColor: isHighlight
                            ? section.id === 'red-flags'
                              ? '#fee2e2'
                              : `${primaryColor}20`
                            : `${primaryColor}10`,
                        }}
                      >
                        {SECTION_ICONS[section.number]}
                      </span>
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Section {String(section.number).padStart(2, '0')}
                        </span>
                        <h2
                          className="text-xl font-bold tracking-tight sm:text-2xl"
                          style={{
                            color: section.id === 'red-flags' ? '#991b1b' : '#111827',
                          }}
                        >
                          {section.title}
                        </h2>
                      </div>
                    </div>
                  </div>

                  {/* Subsections */}
                  <div
                    className="rounded-b-2xl border border-t-0 bg-white"
                    style={{ borderColor: borderSoft }}
                  >
                    {section.subsections.map((sub, subIdx) => (
                      <div
                        key={subIdx}
                        className="px-6 py-6 sm:px-8"
                        style={
                          subIdx < section.subsections.length - 1
                            ? { borderBottom: `1px solid ${borderSoft}` }
                            : undefined
                        }
                      >
                        <h3 className="mb-3 text-lg font-semibold text-gray-900">
                          {sub.heading}
                        </h3>
                        <div className="space-y-3.5 text-[15px] leading-relaxed text-gray-700 sm:text-base sm:leading-relaxed">
                          {sub.body.split('\n\n').map((para, pIdx) => {
                            if (para.startsWith('**') && para.includes(':**')) {
                              const [label, ...rest] = para.split(':**');
                              return (
                                <div key={pIdx}>
                                  <p className="font-semibold text-gray-900">
                                    {label.replace(/^\*\*/, '')}:
                                  </p>
                                  <p>{rest.join(':**')}</p>
                                </div>
                              );
                            }

                            const lines = para.split('\n');
                            const isList = lines.length > 1 && lines.every((l) => l.startsWith('- '));
                            if (isList) {
                              return (
                                <ul key={pIdx} className="ml-1 space-y-2">
                                  {lines.map((line, lIdx) => (
                                    <li key={lIdx} className="flex gap-3">
                                      <span
                                        className="mt-2 h-2 w-2 flex-shrink-0 rounded-full"
                                        style={{ backgroundColor: `${primaryColor}50` }}
                                      />
                                      <span
                                        dangerouslySetInnerHTML={{
                                          __html: line
                                            .replace(/^- /, '')
                                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
                                        }}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              );
                            }

                            return (
                              <p
                                key={pIdx}
                                dangerouslySetInnerHTML={{
                                  __html: para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Final message CTA */}
                    {isLast && (
                      <div className="px-6 pb-8 pt-2 text-center sm:px-8">
                        <div
                          className="mx-auto max-w-md rounded-2xl p-6"
                          style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${primaryColor}08)` }}
                        >
                          <Star className="mx-auto mb-3 h-8 w-8" style={{ color: primaryColor }} />
                          <p className="text-lg font-bold text-gray-900">
                            You&apos;re not just losing weight.
                          </p>
                          <p className="mt-1 text-lg font-bold" style={{ color: primaryColor }}>
                            You&apos;re upgrading your entire system.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Disclaimer */}
          <div className="mt-10 rounded-2xl border border-amber-200/60 bg-amber-50/60 p-5">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
              <p className="text-sm leading-relaxed text-amber-800">
                This handbook is for educational purposes only and does not constitute medical
                advice. Always follow your provider&apos;s specific instructions regarding your
                medication, dosage, and treatment plan. If you are experiencing a medical emergency,
                call 911 immediately.
              </p>
            </div>
          </div>

          {/* Back link */}
          <div className="mt-8 text-center">
            <a
              href="/patient-portal/resources"
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium transition-all hover:shadow-sm"
              style={{
                color: primaryColor,
                backgroundColor: `${primaryColor}10`,
                border: `1px solid ${primaryColor}25`,
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Back to All Resources
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
