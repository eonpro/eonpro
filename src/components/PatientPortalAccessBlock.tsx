'use client';

import { useState } from 'react';
import { UserCheck, UserX, Loader2, Check, Mail, MessageSquare } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface PatientPortalAccessBlockProps {
  patientId: number;
  hasPortalAccess: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
}

export default function PatientPortalAccessBlock({
  patientId,
  hasPortalAccess,
  hasEmail,
  hasPhone,
}: PatientPortalAccessBlockProps) {
  const [sendingChannel, setSendingChannel] = useState<'email' | 'sms' | null>(null);
  const [sentChannel, setSentChannel] = useState<'email' | 'sms' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSendInvite = async (channel: 'email' | 'sms') => {
    setSendingChannel(channel);
    setError(null);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/portal-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to send invite');
        return;
      }
      setSentChannel(channel);
    } finally {
      setSendingChannel(null);
    }
  };

  const canSend = hasEmail || hasPhone;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {hasPortalAccess ? (
            <UserCheck className="h-5 w-5 text-emerald-600" aria-hidden />
          ) : (
            <UserX className="h-5 w-5 text-amber-600" aria-hidden />
          )}
          <h2 className="text-lg font-semibold text-gray-900">Portal access</h2>
        </div>
        {hasPortalAccess && (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Activated
          </span>
        )}
      </div>
      {!hasPortalAccess && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800">
            <UserX className="h-4 w-4" />
            No portal access yet
          </span>
          {canSend ? (
            <span className="flex flex-wrap items-center gap-2">
              {hasEmail && (
                <button
                  type="button"
                  onClick={() => handleSendInvite('email')}
                  disabled={sendingChannel !== null || sentChannel === 'email'}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand-primary, #4fa77e)' }}
                >
                  {sendingChannel === 'email' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : sentChannel === 'email' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {sendingChannel === 'email'
                    ? 'Sending…'
                    : sentChannel === 'email'
                      ? 'Sent via email'
                      : 'Send via email'}
                </button>
              )}
              {hasPhone && (
                <button
                  type="button"
                  onClick={() => handleSendInvite('sms')}
                  disabled={sendingChannel !== null || sentChannel === 'sms'}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                >
                  {sendingChannel === 'sms' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : sentChannel === 'sms' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  {sendingChannel === 'sms'
                    ? 'Sending…'
                    : sentChannel === 'sms'
                      ? 'Sent via SMS'
                      : 'Send via SMS'}
                </button>
              )}
            </span>
          ) : (
            <span className="text-sm text-gray-500">
              Add an email or phone number to send an invite.
            </span>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
