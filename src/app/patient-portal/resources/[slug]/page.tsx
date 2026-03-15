'use client';

import { useParams } from 'next/navigation';
import { ChevronLeft, BookOpen, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { articles } from '@/components/patient-portal/resources/article-content';

export default function ArticlePage() {
  const params = useParams<{ slug: string }>();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const article = articles[params.slug];

  if (!article) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-gray-300" />
        <h1 className="text-xl font-semibold text-gray-900">Article Not Found</h1>
        <p className="mt-2 text-gray-500">The article you&apos;re looking for doesn&apos;t exist.</p>
        <a
          href="/patient-portal/resources"
          className="mt-6 rounded-xl px-6 py-2.5 text-sm font-medium text-white"
          style={{ backgroundColor: primaryColor }}
        >
          Back to Resources
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <a
            href="/patient-portal/resources"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Resources
          </a>
        </div>
      </div>

      {/* Article Header */}
      <div className="border-b bg-white pb-8">
        <div className="mx-auto max-w-3xl px-4 pt-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {article.category}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              {article.readTime}
            </span>
            <span className="text-xs text-gray-400">Updated {article.lastUpdated}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {article.title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-gray-600 sm:text-lg">
            {article.subtitle}
          </p>
        </div>
      </div>

      {/* Article Body */}
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-10">
          {article.sections.map((section, idx) => (
            <section key={idx}>
              <h2 className="mb-4 text-xl font-semibold text-gray-900">{section.heading}</h2>
              <div className="space-y-4 text-[15px] leading-relaxed text-gray-700">
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
                      <ul key={pIdx} className="ml-1 space-y-2">
                        {lines.map((line, lIdx) => (
                          <li key={lIdx} className="flex gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
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
          ))}
        </div>

        {/* Key Takeaways */}
        <div
          className="mt-12 rounded-2xl border p-6"
          style={{ borderColor: `${primaryColor}30`, backgroundColor: `${primaryColor}08` }}
        >
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <CheckCircle2 className="h-5 w-5" style={{ color: primaryColor }} />
            Key Takeaways
          </h3>
          <ul className="space-y-3">
            {article.keyTakeaways.map((takeaway, idx) => (
              <li key={idx} className="flex gap-3 text-[15px] text-gray-700">
                <span
                  className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: primaryColor }}
                />
                {takeaway}
              </li>
            ))}
          </ul>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <p className="text-sm leading-relaxed text-amber-800">{article.disclaimer}</p>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-10 text-center">
          <a
            href="/patient-portal/resources"
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            style={{ color: primaryColor }}
          >
            <ChevronLeft className="h-4 w-4" />
            Back to All Resources
          </a>
        </div>
      </div>
    </div>
  );
}
