'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, AlertTriangle, Menu, X, ArrowUp } from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  handbookTitle,
  handbookSubtitle,
  handbookSections,
} from '@/components/patient-portal/handbook/handbook-content';

/* ─── Color helpers ─── */

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

function palette(hex: string) {
  const { h, s } = hexToHSL(hex);
  return {
    bg: `hsl(${h}, ${Math.round(s * 22)}%, 97.5%)`,
    bgAlt: `hsl(${h}, ${Math.round(s * 18)}%, 95%)`,
    border: `hsl(${h}, ${Math.round(s * 20)}%, 91%)`,
    tint: `hsl(${h}, ${Math.round(s * 30)}%, 96%)`,
    calloutBg: `hsl(${h}, ${Math.round(s * 35)}%, 97%)`,
    calloutBorder: `hsl(${h}, ${Math.round(s * 45)}%, 86%)`,
    tocBg: `hsl(${h}, ${Math.round(s * 16)}%, 99%)`,
    heroGrad1: `hsl(${h}, ${Math.round(s * 50)}%, 93%)`,
    heroGrad2: `hsl(${(h + 18) % 360}, ${Math.round(s * 40)}%, 90%)`,
  };
}

/* ─── Section icon SVGs (no emojis) ─── */

function SectionIcon({ num, color, size = 20 }: { num: number; color: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (num) {
    case 1:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );
    case 2:
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 3:
      return (
        <svg {...p}>
          <path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3" />
          <line x1="9" y1="9" x2="15" y2="9" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="12" y2="17" />
        </svg>
      );
    case 4:
      return (
        <svg {...p}>
          <path d="M12 2L12 22" />
          <path d="M5 12h14" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 5:
      return (
        <svg {...p}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 6:
      return (
        <svg {...p}>
          <path d="M12 3c-1.5 0-3 1.5-3 4s3 5 3 5 3-2.5 3-5-1.5-4-3-4z" />
          <path d="M6.5 15C4 15 2 17 2 19.5V22h20v-2.5C22 17 20 15 17.5 15" />
          <line x1="8" y1="22" x2="8" y2="18" />
          <line x1="16" y1="22" x2="16" y2="18" />
        </svg>
      );
    case 7:
      return (
        <svg {...p}>
          <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z" />
        </svg>
      );
    case 8:
      return (
        <svg {...p}>
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      );
    case 9:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <path d="M16 12l-4 4-4-4" />
          <path d="M12 8v8" />
        </svg>
      );
    case 10:
      return (
        <svg {...p}>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 11:
      return (
        <svg {...p}>
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    case 12:
      return (
        <svg {...p}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 13:
      return (
        <svg {...p}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case 14:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 15:
      return (
        <svg {...p}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

/* ─── Decorative blobs (hero only) ─── */

function HeroDecoration({ p }: { p: ReturnType<typeof palette> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -right-28 -top-28 h-[480px] w-[480px] rounded-full opacity-60 blur-3xl"
        style={{ background: `radial-gradient(circle, ${p.heroGrad1}, transparent 70%)` }}
      />
      <div
        className="absolute -left-20 top-10 h-[360px] w-[360px] rounded-full opacity-40 blur-3xl"
        style={{ background: `radial-gradient(circle, ${p.heroGrad2}, transparent 70%)` }}
      />
      <div
        className="absolute -bottom-16 right-1/3 h-[240px] w-[500px] rounded-full opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, ${p.heroGrad1}, transparent 70%)` }}
      />
    </div>
  );
}

/* ─── Markdown renderer ─── */

function RenderBody({ text, color }: { text: string; color: string }) {
  const paragraphs = text.split('\n\n');
  return (
    <div className="space-y-4">
      {paragraphs.map((para, i) => {
        if (para.startsWith('**') && para.includes(':**')) {
          const [label, ...rest] = para.split(':**');
          return (
            <div key={i}>
              <p className="font-semibold text-gray-900">{label.replace(/^\*\*/, '')}:</p>
              <p className="mt-1 text-gray-600">{rest.join(':**')}</p>
            </div>
          );
        }

        const lines = para.split('\n');
        const isList = lines.length > 1 && lines.every((l) => l.startsWith('- '));
        if (isList) {
          return (
            <ul key={i} className="space-y-2 pl-0.5">
              {lines.map((line, j) => (
                <li key={j} className="flex gap-3 text-gray-600">
                  <span
                    className="mt-[9px] h-[6px] w-[6px] flex-shrink-0 rounded-full"
                    style={{ backgroundColor: color, opacity: 0.5 }}
                  />
                  <span
                    dangerouslySetInnerHTML={{
                      __html: line
                        .replace(/^- /, '')
                        .replace(
                          /\*\*(.+?)\*\*/g,
                          '<strong class="text-gray-900 font-semibold">$1</strong>'
                        ),
                    }}
                  />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p
            key={i}
            className="text-gray-600"
            dangerouslySetInnerHTML={{
              __html: para.replace(
                /\*\*(.+?)\*\*/g,
                '<strong class="text-gray-900 font-semibold">$1</strong>'
              ),
            }}
          />
        );
      })}
    </div>
  );
}

/* ─── Main page ─── */

export default function HandbookPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const p = palette(primaryColor);

  const [activeSection, setActiveSection] = useState(handbookSections[0].id);
  const [tocOpen, setTocOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
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
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-100px 0px -55% 0px', threshold: 0.05 }
    );
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 800);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTocOpen(false);
  }, []);

  const progressPercent = useMemo(() => {
    const idx = handbookSections.findIndex((sec) => sec.id === activeSection);
    return Math.round(((idx + 1) / handbookSections.length) * 100);
  }, [activeSection]);

  const activeIdx = handbookSections.findIndex((s) => s.id === activeSection);

  return (
    <div className="min-h-screen" style={{ backgroundColor: p.bg }}>
      {/* ─── Sticky Nav ─── */}
      <div
        className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur-lg"
        style={{ borderColor: p.border }}
      >
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-5 py-3 sm:px-8">
          <a
            href="/patient-portal/resources"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 transition-colors hover:text-gray-600"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Resources
          </a>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="text-[11px] font-medium uppercase tracking-widest text-gray-400">
                Section {String(activeIdx + 1).padStart(2, '0')}/
                {String(handbookSections.length).padStart(2, '0')}
              </span>
              <div
                className="h-1 w-20 overflow-hidden rounded-full"
                style={{ backgroundColor: p.bgAlt }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progressPercent}%`, backgroundColor: primaryColor }}
                />
              </div>
            </div>

            <button
              onClick={() => setTocOpen(!tocOpen)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-50 lg:hidden"
            >
              {tocOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Hero ─── */}
      <header
        className="relative overflow-hidden"
        style={{ borderBottom: `1px solid ${p.border}` }}
      >
        <HeroDecoration p={p} />
        <div className="relative mx-auto max-w-[1120px] px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
          <div className="max-w-2xl">
            <p
              className="mb-4 text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: primaryColor }}
            >
              Patient Handbook
            </p>
            <h1 className="text-[2.5rem] font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              {handbookTitle}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-gray-500 sm:text-xl">
              {handbookSubtitle}
            </p>
            <div className="mt-8 flex items-center gap-3 text-[13px] text-gray-400">
              <span className="rounded-full border px-3 py-1" style={{ borderColor: p.border }}>
                {handbookSections.length} sections
              </span>
              <span className="rounded-full border px-3 py-1" style={{ borderColor: p.border }}>
                20 min read
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Mobile TOC ─── */}
      {tocOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setTocOpen(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white pb-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sticky top-0 flex items-center justify-between border-b bg-white px-5 py-4"
              style={{ borderColor: p.border }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">
                Contents
              </p>
              <button onClick={() => setTocOpen(false)} className="rounded-lg p-1 hover:bg-gray-50">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <nav className="px-3 pt-2">
              {handbookSections.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-all ${
                      isActive ? 'font-semibold' : 'text-gray-500'
                    }`}
                    style={
                      isActive
                        ? { backgroundColor: `${primaryColor}08`, color: primaryColor }
                        : undefined
                    }
                  >
                    <span
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: isActive ? `${primaryColor}12` : p.bgAlt }}
                    >
                      <SectionIcon
                        num={section.number}
                        color={isActive ? primaryColor : '#9ca3af'}
                        size={14}
                      />
                    </span>
                    <span className="flex-1">{section.title}</span>
                    <span className="text-[11px] tabular-nums text-gray-300">
                      {String(section.number).padStart(2, '0')}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* ─── Layout ─── */}
      <div className="mx-auto flex max-w-[1120px] gap-0 px-5 py-12 sm:px-8 lg:gap-12 lg:py-16">
        {/* Desktop TOC */}
        <aside className="hidden w-[260px] flex-shrink-0 lg:block">
          <nav
            className="sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto rounded-xl border py-4"
            style={{ backgroundColor: p.tocBg, borderColor: p.border }}
          >
            <p className="mb-2 px-5 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
              Contents
            </p>
            {handbookSections.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className="group flex w-full items-center gap-2.5 px-5 py-[7px] text-left text-[13px] transition-all"
                  style={{ color: isActive ? primaryColor : undefined }}
                >
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors"
                    style={{ backgroundColor: isActive ? `${primaryColor}10` : 'transparent' }}
                  >
                    <SectionIcon
                      num={section.number}
                      color={isActive ? primaryColor : '#b0b0b0'}
                      size={13}
                    />
                  </span>
                  <span
                    className={`flex-1 truncate ${isActive ? 'font-semibold' : 'text-gray-500 group-hover:text-gray-700'}`}
                  >
                    {section.title}
                  </span>
                  {isActive && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">
          {handbookSections.map((section, sIdx) => {
            const isRedFlag = section.id === 'red-flags';
            const isFinal = section.id === 'final-message';

            return (
              <article
                key={section.id}
                id={section.id}
                ref={(el) => setSectionRef(section.id, el)}
                className="scroll-mt-24"
                style={{ marginBottom: isFinal ? 0 : 48 }}
              >
                {/* Section header */}
                <div className="mb-6 flex items-start gap-4 sm:mb-8">
                  <span
                    className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11"
                    style={{
                      backgroundColor: isRedFlag ? '#fef2f2' : `${primaryColor}08`,
                      border: `1px solid ${isRedFlag ? '#fecaca' : `${primaryColor}18`}`,
                    }}
                  >
                    <SectionIcon
                      num={section.number}
                      color={isRedFlag ? '#dc2626' : primaryColor}
                      size={18}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-400">
                      Section {String(section.number).padStart(2, '0')}
                    </p>
                    <h2
                      className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl"
                      style={{ color: isRedFlag ? '#991b1b' : '#111' }}
                    >
                      {section.title}
                    </h2>
                    {section.subtitle && (
                      <p className="mt-1.5 text-[15px] leading-relaxed text-gray-400">
                        {section.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                {/* Subsections */}
                <div className="space-y-0">
                  {section.subsections.map((sub, subIdx) => (
                    <div
                      key={subIdx}
                      className="rounded-none border-l-2 pb-8 pl-6 sm:pl-8"
                      style={{
                        borderColor:
                          subIdx === section.subsections.length - 1 ? 'transparent' : p.border,
                        marginLeft: 19,
                      }}
                    >
                      <h3 className="mb-3 text-[17px] font-semibold text-gray-900 sm:text-lg">
                        {sub.heading}
                      </h3>
                      <div className="text-[15px] leading-[1.75] sm:text-base sm:leading-[1.8]">
                        <RenderBody text={sub.body} color={primaryColor} />
                      </div>

                      {sub.callout && (
                        <div
                          className="mt-5 rounded-xl border-l-[3px] px-5 py-4"
                          style={{
                            backgroundColor: p.calloutBg,
                            borderLeftColor: primaryColor,
                          }}
                        >
                          <p
                            className="text-[15px] font-medium leading-relaxed"
                            style={{ color: primaryColor }}
                          >
                            {sub.callout}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Final CTA block */}
                {isFinal && (
                  <div
                    className="mt-4 rounded-2xl px-8 py-10 text-center sm:py-14"
                    style={{
                      background: `linear-gradient(135deg, ${primaryColor}0a, ${primaryColor}04)`,
                      border: `1px solid ${primaryColor}15`,
                    }}
                  >
                    <p className="text-2xl font-bold text-gray-900 sm:text-3xl">
                      You&apos;re not just losing weight.
                    </p>
                    <p
                      className="mt-2 text-2xl font-bold sm:text-3xl"
                      style={{ color: primaryColor }}
                    >
                      You&apos;re upgrading your entire system.
                    </p>
                  </div>
                )}

                {/* Section divider */}
                {!isFinal && sIdx < handbookSections.length - 1 && (
                  <hr
                    className="mb-0 mt-2 border-none"
                    style={{ height: 1, backgroundColor: p.border }}
                  />
                )}
              </article>
            );
          })}

          {/* Disclaimer */}
          <div className="mt-12 flex gap-3.5 rounded-xl border border-amber-100 bg-amber-50/50 px-5 py-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
            <p className="text-[13px] leading-relaxed text-amber-700">
              This handbook is for educational purposes only and does not constitute medical advice.
              Always follow your provider&apos;s specific instructions regarding your medication,
              dosage, and treatment plan. If you are experiencing a medical emergency, call 911
              immediately.
            </p>
          </div>

          {/* Footer nav */}
          <div className="mt-10 text-center">
            <a
              href="/patient-portal/resources"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-400 transition-colors hover:text-gray-600"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to Resources
            </a>
          </div>
        </main>
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg transition-all hover:shadow-xl"
          style={{ border: `1px solid ${p.border}` }}
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-4 w-4 text-gray-500" />
        </button>
      )}
    </div>
  );
}
