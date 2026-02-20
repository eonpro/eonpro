'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

const TREATMENT_CARDS = [
  {
    id: 'weight-loss',
    title: 'Weight Loss Program',
    description:
      'FDA-approved GLP-1 medications to help you reach your weight goals with personalized provider support.',
    highlights: ['Semaglutide & Tirzepatide', 'Personalized dosing', 'Monthly check-ins'],
    icon: '⚖️',
  },
  {
    id: 'hormone-therapy',
    title: 'Hormone Therapy',
    description:
      'Restore hormonal balance with bio-identical hormones tailored to your body chemistry.',
    highlights: ['Testosterone optimization', 'Thyroid support', 'Lab monitoring'],
    icon: '🧬',
  },
  {
    id: 'general-wellness',
    title: 'General Wellness',
    description:
      'Comprehensive health programs including vitamins, supplements, and preventive care.',
    highlights: ['Vitamin therapy', 'Preventive screening', 'Lifestyle coaching'],
    icon: '💚',
  },
];

export default function TreatmentsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Our Treatments</h1>
        <p className="text-gray-500 mt-1">
          Explore the programs available to you
        </p>
      </div>

      <div className="space-y-4">
        {TREATMENT_CARDS.map((treatment) => (
          <div
            key={treatment.id}
            className="rounded-xl border border-gray-100 p-6 hover:border-gray-200 transition-colors"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">{treatment.icon}</span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">
                  {treatment.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {treatment.description}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {treatment.highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-indigo-50 p-6 text-center">
        <h3 className="text-base font-semibold text-gray-900">
          Ready to get started?
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Complete your intake form and a licensed provider will review your
          information.
        </p>
        <Link
          href="/patient-portal/intake"
          className="
            inline-flex items-center gap-2 mt-4 px-5 py-2.5
            bg-indigo-600 text-white font-medium text-sm rounded-full
            hover:bg-indigo-700 transition-colors
          "
        >
          Start Intake
          <ArrowRightIcon className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
