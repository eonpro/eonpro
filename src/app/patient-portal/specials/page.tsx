'use client';

import React from 'react';
import Link from 'next/link';
import {
  GiftIcon,
  UserGroupIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

export default function SpecialsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Specials &amp; Promotions
        </h1>
        <p className="text-gray-500 mt-1">
          Take advantage of our current offers
        </p>
      </div>

      {/* Promotions placeholder — these would be populated from clinic settings / API */}
      <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-6 text-center">
        <GiftIcon className="w-10 h-10 text-amber-400 mx-auto" />
        <h2 className="mt-3 text-lg font-semibold text-gray-900">
          New Patient Special
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Complete your intake today and receive a special introductory offer on
          your first month of treatment.
        </p>
        <Link
          href="/patient-portal/intake"
          className="
            inline-flex items-center gap-2 mt-4 px-5 py-2.5
            bg-amber-500 text-white font-medium text-sm rounded-full
            hover:bg-amber-600 transition-colors
          "
        >
          Get Started
          <ArrowRightIcon className="w-4 h-4" />
        </Link>
      </div>

      {/* Referral program */}
      <div className="rounded-xl border border-gray-100 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-teal-50">
            <UserGroupIcon className="w-6 h-6 text-teal-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Referral Program
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Know someone who could benefit from our programs? Refer a friend
              and you both receive a discount on your next month.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">
          Specials are updated regularly. Complete your intake to unlock
          personalized offers.
        </p>
      </div>
    </div>
  );
}
