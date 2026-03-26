'use client';

import { useParams } from 'next/navigation';
import { ChevronLeft, BookOpen, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { articles } from '@/components/patient-portal/resources/article-content';

function hexToHSL(hex: string): { h: number; s: number; l: number } {
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

function HeroBlobs({ color }: { color: string }) {
  const { h, s } = hexToHSL(color);
  const warm1 = `hsl(${h}, ${Math.round(s * 60)}%, 92%)`;
  const warm2 = `hsl(${(h + 15) % 360}, ${Math.round(s * 50)}%, 88%)`;
  const warm3 = `hsl(${(h - 10 + 360) % 360}, ${Math.round(s * 40)}%, 95%)`;
  const accent = `hsl(${h}, ${Math.round(s * 70)}%, 82%)`;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg
        className="absolute -right-24 -top-20 h-[420px] w-[420px] opacity-70"
        viewBox="0 0 400 400"
        fill="none"
      >
        <path
          d="M300,50 C380,80 400,180 370,260 C340,340 240,380 160,350 C80,320 20,240 50,160 C80,80 220,20 300,50Z"
          fill={warm1}
        />
      </svg>

      <svg
        className="absolute -left-16 top-8 h-[340px] w-[340px] opacity-50"
        viewBox="0 0 320 320"
        fill="none"
      >
        <ellipse cx="160" cy="160" rx="150" ry="120" fill={warm2} />
      </svg>

      <svg
        className="absolute right-12 top-36 h-[180px] w-[180px] opacity-40"
        viewBox="0 0 160 160"
        fill="none"
      >
        <circle cx="80" cy="80" r="72" fill={accent} />
      </svg>

      <svg
        className="absolute -bottom-10 left-1/3 h-[260px] w-[520px] opacity-30"
        viewBox="0 0 520 200"
        fill="none"
      >
        <ellipse cx="260" cy="140" rx="250" ry="100" fill={warm3} />
      </svg>
    </div>
  );
}

function SectionDivider({ color }: { color: string }) {
  const { h, s } = hexToHSL(color);
  const line = `hsl(${h}, ${Math.round(s * 40)}%, 88%)`;

  return (
    <div className="flex items-center gap-4 py-2" aria-hidden="true">
      <div className="h-px flex-1" style={{ backgroundColor: line }} />
      <svg width="36" height="12" viewBox="0 0 36 12" fill="none">
        <rect x="0" y="3" width="12" height="6" rx="3" fill={line} />
        <rect x="16" y="4" width="8" height="4" rx="2" fill={line} opacity="0.6" />
        <circle cx="32" cy="6" r="3" fill={line} opacity="0.4" />
      </svg>
      <div className="h-px flex-1" style={{ backgroundColor: line }} />
    </div>
  );
}

function FloatingAccent({
  color,
  variant,
}: {
  color: string;
  variant: 'blob' | 'pill' | 'circle' | 'ring';
}) {
  const { h, s } = hexToHSL(color);
  const fill = `hsl(${h}, ${Math.round(s * 50)}%, 90%)`;
  const stroke = `hsl(${h}, ${Math.round(s * 60)}%, 82%)`;

  if (variant === 'pill')
    return (
      <svg width="48" height="20" viewBox="0 0 48 20" fill="none" className="flex-shrink-0">
        <rect width="48" height="20" rx="10" fill={fill} />
      </svg>
    );
  if (variant === 'circle')
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
        <circle cx="12" cy="12" r="11" fill={fill} />
      </svg>
    );
  if (variant === 'ring')
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="flex-shrink-0">
        <circle cx="14" cy="14" r="11" stroke={stroke} strokeWidth="2.5" fill="none" />
      </svg>
    );
  return (
    <svg width="40" height="32" viewBox="0 0 40 32" fill="none" className="flex-shrink-0">
      <path
        d="M28,2 C36,6 40,14 36,24 C32,30 20,32 12,28 C4,24 0,14 6,6 C12,-2 20,-2 28,2Z"
        fill={fill}
      />
    </svg>
  );
}

const ACCENT_VARIANTS: Array<'blob' | 'pill' | 'circle' | 'ring'> = [
  'pill',
  'blob',
  'circle',
  'ring',
];

export default function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const { h, s } = hexToHSL(primaryColor);

  const article = articles[params.slug];

  const bgWarm = `hsl(${h}, ${Math.round(s * 30)}%, 97%)`;
  const bgAlt = `hsl(${(h + 10) % 360}, ${Math.round(s * 20)}%, 98%)`;
  const borderSoft = `hsl(${h}, ${Math.round(s * 30)}%, 90%)`;

  if (!article) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-gray-300" />
        <h1 className="text-xl font-semibold text-gray-900">Article Not Found</h1>
        <p className="mt-2 text-gray-500">The article you&apos;re looking for doesn&apos;t exist.</p>
        <a
          href="/patient-portal/resources"
          className="mt-6 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          Back to Resources
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgWarm }}>
      {/* Navigation */}
      <div className="border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <a
            href="/patient-portal/resources"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Resources
          </a>
        </div>
      </div>

      {/* Hero Header with Abstract Blobs */}
      <div className="relative overflow-hidden border-b" style={{ borderColor: borderSoft }}>
        <HeroBlobs color={primaryColor} />

        <div className="relative mx-auto max-w-3xl px-4 pb-12 pt-10 sm:pb-16 sm:pt-14">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase"
              style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {article.category}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1 text-xs text-gray-500 backdrop-blur-sm">
              <Clock className="h-3.5 w-3.5" />
              {article.readTime}
            </span>
            <span className="rounded-full bg-white/60 px-3 py-1 text-xs text-gray-400 backdrop-blur-sm">
              Updated {article.lastUpdated}
            </span>
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl sm:leading-tight">
            {article.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg sm:leading-relaxed">
            {article.subtitle}
          </p>

          {/* Decorative pill shapes under the title */}
          <div className="mt-6 flex items-center gap-2" aria-hidden="true">
            <div
              className="h-1.5 w-16 rounded-full"
              style={{ backgroundColor: primaryColor, opacity: 0.6 }}
            />
            <div
              className="h-1.5 w-8 rounded-full"
              style={{ backgroundColor: primaryColor, opacity: 0.3 }}
            />
            <div
              className="h-1.5 w-4 rounded-full"
              style={{ backgroundColor: primaryColor, opacity: 0.15 }}
            />
          </div>
        </div>
      </div>

      {/* Article Body */}
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="space-y-6">
          {article.sections.map((section, idx) => {
            const isEven = idx % 2 === 0;
            const accentVariant = ACCENT_VARIANTS[idx % ACCENT_VARIANTS.length];

            return (
              <div key={idx}>
                {idx > 0 && <SectionDivider color={primaryColor} />}

                <section
                  className="rounded-2xl p-6 sm:p-8"
                  style={{
                    backgroundColor: isEven ? 'white' : bgAlt,
                    border: isEven ? `1px solid ${borderSoft}` : 'none',
                  }}
                >
                  <div className="mb-5 flex items-start gap-3">
                    <FloatingAccent color={primaryColor} variant={accentVariant} />
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
                      {section.heading}
                    </h2>
                  </div>

                  <div className="space-y-4 text-[15px] leading-relaxed text-gray-700 sm:text-base sm:leading-relaxed">
                    {section.body.split('\n\n').map((paragraph, pIdx) => {
                      if (paragraph.startsWith('**') && paragraph.includes(':**')) {
                        const [label, ...rest] = paragraph.split(':**');
                        return (
                          <div key={pIdx}>
                            <p className="font-semibold text-gray-900">
                              {label.replace(/^\*\*/, '')}:
                            </p>
                            <p>{rest.join(':**')}</p>
                          </div>
                        );
                      }

                      const lines = paragraph.split('\n');
                      const isList = lines.length > 1 && lines.every((l) => l.startsWith('- '));
                      if (isList) {
                        return (
                          <ul key={pIdx} className="ml-1 space-y-2.5">
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
                            __html: paragraph.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              </div>
            );
          })}
        </div>

        {/* Key Takeaways */}
        <div className="relative mt-14 overflow-hidden rounded-3xl p-1" style={{ background: `linear-gradient(135deg, ${primaryColor}30, ${primaryColor}10, ${primaryColor}20)` }}>
          <div className="relative rounded-[20px] bg-white p-6 sm:p-8">
            {/* Corner accent blobs */}
            <svg
              className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 opacity-20"
              viewBox="0 0 100 100"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="45" fill={primaryColor} />
            </svg>
            <svg
              className="pointer-events-none absolute -bottom-4 -left-4 h-20 w-20 opacity-15"
              viewBox="0 0 80 80"
              fill="none"
              aria-hidden="true"
            >
              <ellipse cx="40" cy="40" rx="38" ry="30" fill={primaryColor} />
            </svg>

            <h3 className="relative mb-5 flex items-center gap-2.5 text-lg font-bold text-gray-900">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <CheckCircle2 className="h-5 w-5" style={{ color: primaryColor }} />
              </span>
              Key Takeaways
            </h3>
            <ul className="relative space-y-3.5">
              {article.keyTakeaways.map((takeaway, idx) => (
                <li key={idx} className="flex gap-3 text-[15px] leading-relaxed text-gray-700">
                  <span
                    className="mt-2 h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: primaryColor }}
                  />
                  {takeaway}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-2xl border border-amber-200/60 bg-amber-50/60 p-5 backdrop-blur-sm">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
            <p className="text-sm leading-relaxed text-amber-800">{article.disclaimer}</p>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-12 text-center">
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
      </div>
    </div>
  );
}
