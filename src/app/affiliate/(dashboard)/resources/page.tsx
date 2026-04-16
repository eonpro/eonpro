'use client';

/**
 * Affiliate Resources Page
 *
 * Marketing materials, copy templates, and promotional guides.
 */

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Copy,
  Check,
  MessageSquare,
  Image,
  FileText,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useBranding } from '../branding-context';

interface CopyTemplate {
  id: string;
  label: string;
  text: string;
  platform: string;
}

interface TipSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  tips: string[];
}

export default function AffiliateResourcesPage() {
  const branding = useBranding();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTip, setExpandedTip] = useState<string | null>('getting-started');

  const brandName = branding.clinicName || 'our partner';

  const copyTemplates: CopyTemplate[] = [
    {
      id: 'social-general',
      label: 'General Social Post',
      platform: 'All platforms',
      text: `I've been loving my experience with ${brandName}! If you're looking to start your wellness journey, check out my link in bio. You won't regret it.`,
    },
    {
      id: 'instagram-story',
      label: 'Instagram Story',
      platform: 'Instagram',
      text: `Swipe up to check out ${brandName} — they've been a game changer for me! Use my link for a seamless experience.`,
    },
    {
      id: 'tiktok-caption',
      label: 'TikTok Caption',
      platform: 'TikTok',
      text: `This is your sign to start your wellness journey! Link in bio to get started with ${brandName}.`,
    },
    {
      id: 'email-intro',
      label: 'Email Introduction',
      platform: 'Email',
      text: `Hi! I wanted to share something I've personally been using and loving. ${brandName} has an amazing program that I think would benefit you. Click my personal link below to learn more and get started.`,
    },
    {
      id: 'text-message',
      label: 'Text Message',
      platform: 'SMS',
      text: `Hey! Thought of you — I've been using ${brandName} and it's been great. Check it out here:`,
    },
  ];

  const tipSections: TipSection[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      icon: <Lightbulb className="h-5 w-5 text-amber-500" />,
      tips: [
        'Add your referral link to your social media bio — this is where most conversions come from',
        'Create separate tracking links for each platform (Instagram, TikTok, etc.) to see what works best',
        'Share your personal experience and results for the most authentic content',
        'Engage with your audience\'s questions in DMs to build trust before sharing your link',
      ],
    },
    {
      id: 'content-ideas',
      title: 'Content Ideas',
      icon: <MessageSquare className="h-5 w-5 text-blue-500" />,
      tips: [
        'Share your "why" story — what motivated you to start and how it\'s going',
        'Create before/after content (with permission) to show real results',
        'Do Q&A sessions or Lives where you answer common questions',
        'Share quick tips related to wellness that naturally lead to your recommendation',
        'Post testimonials or success stories (anonymized) from people you\'ve referred',
      ],
    },
    {
      id: 'best-practices',
      title: 'Best Practices',
      icon: <FileText className="h-5 w-5 text-green-500" />,
      tips: [
        'Be consistent — post about it regularly, not just once',
        'Always disclose your affiliate relationship (#ad, #partner, #affiliate)',
        'Focus on the value and benefits, not just the product features',
        'Respond to comments and questions promptly to increase conversions',
        'Track your analytics weekly to understand what content performs best',
        'Use your QR code in physical materials, stories, and video content',
      ],
    },
  ];

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/affiliate"
            className="mb-4 inline-flex items-center gap-2 text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Resources</h1>
          <p className="mt-1 text-gray-500">Copy templates and tips to help you succeed</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {/* Copy Templates */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Copy className="h-5 w-5 text-gray-400" />
            Copy Templates
          </h2>
          <div className="space-y-3">
            {copyTemplates.map((template, index) => (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-2xl bg-white p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{template.label}</h3>
                    <span className="text-xs text-gray-500">{template.platform}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(template.id, template.text)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      copiedId === template.id
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {copiedId === template.id ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-gray-600">{template.text}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Tips & Guides */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Tips & Guides
          </h2>
          <div className="space-y-3">
            {tipSections.map((section) => (
              <div key={section.id} className="rounded-2xl bg-white">
                <button
                  onClick={() =>
                    setExpandedTip(expandedTip === section.id ? null : section.id)
                  }
                  className="flex w-full items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    {section.icon}
                    <span className="font-medium text-gray-900">{section.title}</span>
                  </div>
                  {expandedTip === section.id ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </button>

                {expandedTip === section.id && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                    <ul className="space-y-3">
                      {section.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                          <span
                            className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: 'var(--brand-primary)' }}
                          >
                            {i + 1}
                          </span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 gap-3"
        >
          <Link
            href="/affiliate/links"
            className="rounded-2xl bg-white p-5 text-center transition-shadow hover:shadow-sm"
          >
            <Image className="mx-auto mb-2 h-6 w-6 text-gray-400" />
            <p className="text-sm font-medium text-gray-900">Get Your Links</p>
            <p className="mt-1 text-xs text-gray-500">Copy & QR codes</p>
          </Link>
          <Link
            href="/affiliate/analytics"
            className="rounded-2xl bg-white p-5 text-center transition-shadow hover:shadow-sm"
          >
            <FileText className="mx-auto mb-2 h-6 w-6 text-gray-400" />
            <p className="text-sm font-medium text-gray-900">View Analytics</p>
            <p className="mt-1 text-xs text-gray-500">Track performance</p>
          </Link>
        </motion.div>

        <div className="h-4" />
      </div>
    </div>
  );
}
