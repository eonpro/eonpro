'use client';

import React from 'react';
import { Gift, Users } from 'lucide-react';

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

      <div className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/50 p-6 text-center">
        <Gift className="w-10 h-10 text-amber-400 mx-auto" />
        <h2 className="mt-3 text-lg font-semibold text-gray-900">
          New Patient Special
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Contact your provider to learn about current promotions and
          introductory offers on your treatment plan.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-teal-50">
            <Users className="w-6 h-6 text-teal-500" />
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

      <div className="rounded-xl bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">
          Specials are updated regularly. Check back often for new offers.
        </p>
      </div>
    </div>
  );
}
