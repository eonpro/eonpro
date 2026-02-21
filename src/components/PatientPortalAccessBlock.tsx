'use client';

import { useState } from 'react';
import {
  UserCheck,
  UserX,
  Loader2,
  Check,
  Mail,
  MessageSquare,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface LastInvite {
  sentAt: string;
  trigger: string;
  used: boolean;
  expired: boolean;
}

interface PatientPortalAccessBlockProps {
  patientId: number;
  hasPortalAccess: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  lastInvite?: LastInvite | null;
}

function formatInviteDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case 'first_payment':
      return 'payment';
    case 'first_order':
      return 'order';
    default:
      return 'manual';
  }
}

export default function PatientPortalAccessBlock({
  patientId,
  hasPortalAccess,
  hasEmail,
  hasPhone,
  lastInvite,
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
        <>
          {/* Invite status banner — persists from DB, always visible when an invite exists */}
          {lastInvite && (
            <div
              className={`mb-4 flex items-start gap-3 rounded-lg px-4 py-3 text-sm ${
                lastInvite.expired
                  ? 'border border-amber-200 bg-amber-50 text-amber-800'
                  : 'border border-blue-200 bg-blue-50 text-blue-800'
              }`}
            >
              {lastInvite.expired ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Send className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  {lastInvite.expired
                    ? 'Portal invite expired'
                    : 'Portal invite sent'}
                </p>
                <p className="mt-0.5 text-xs opacity-80">
                  Sent on {formatInviteDate(lastInvite.sentAt)}
                  {lastInvite.trigger !== 'manual' && (
                    <> &middot; Triggered by {triggerLabel(lastInvite.trigger)}</>
                  )}
                  {lastInvite.expired && (
                    <> &middot; Send a new invite below</>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Just-sent confirmation — shown after clicking send */}
          {sentChannel && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Check className="h-4 w-4 shrink-0" />
              <p className="font-medium">
                New invite sent via {sentChannel === 'sms' ? 'SMS' : 'email'} just now
              </p>
            </div>
          )}

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
                    disabled={sendingChannel !== null}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
                    style={{ backgroundColor: 'var(--brand-primary, #4fa77e)' }}
                  >
                    {sendingChannel === 'email' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {sendingChannel === 'email'
                      ? 'Sending…'
                      : lastInvite || sentChannel
                        ? 'Resend via email'
                        : 'Send via email'}
                  </button>
                )}
                {hasPhone && (
                  <button
                    type="button"
                    onClick={() => handleSendInvite('sms')}
                    disabled={sendingChannel !== null}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                  >
                    {sendingChannel === 'sms' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    {sendingChannel === 'sms'
                      ? 'Sending…'
                      : lastInvite || sentChannel
                        ? 'Resend via SMS'
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
        </>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
