'use client';

/**
 * Public CSAT Survey Page
 * =======================
 *
 * No authentication required -- accessed via unique token link.
 * Patients rate their support experience 1-5 stars with optional feedback.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Star, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

interface SurveyData {
  ticketNumber: string;
  ticketTitle: string;
  hasResponded: boolean;
  isExpired: boolean;
  score: number;
  feedback?: string | null;
}

export default function CsatPage() {
  const params = useParams();
  const token = params.token as string;

  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedScore, setSelectedScore] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/csat/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject('Not found'))
      .then((d) => setSurvey(d.survey))
      .catch(() => setError('Survey not found'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (selectedScore === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/csat/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: selectedScore, feedback: feedback.trim() || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-4 max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <XCircle className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Survey Not Found</h1>
          <p className="mt-2 text-gray-500">This survey link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  if (survey.isExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-4 max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <Clock className="mx-auto h-12 w-12 text-yellow-400" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Survey Expired</h1>
          <p className="mt-2 text-gray-500">This survey is no longer accepting responses.</p>
        </div>
      </div>
    );
  }

  if (survey.hasResponded || submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-4 max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Thank You!</h1>
          <p className="mt-2 text-gray-500">
            Your feedback helps us improve our support. We appreciate you taking the time to respond.
          </p>
        </div>
      </div>
    );
  }

  const LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">How was your experience?</h1>
          <p className="mt-2 text-sm text-gray-500">
            Regarding ticket <span className="font-medium">{survey.ticketNumber}</span>
          </p>
          <p className="mt-1 text-sm text-gray-600">{survey.ticketTitle}</p>
        </div>

        <div className="mt-8 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              onMouseEnter={() => setHoveredStar(score)}
              onMouseLeave={() => setHoveredStar(0)}
              onClick={() => setSelectedScore(score)}
              className="rounded-lg p-2 transition-transform hover:scale-110"
            >
              <Star
                className={`h-10 w-10 transition-colors ${
                  score <= (hoveredStar || selectedScore)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>

        {selectedScore > 0 && (
          <p className="mt-2 text-center text-sm font-medium text-gray-700">
            {LABELS[selectedScore]}
          </p>
        )}

        <div className="mt-6">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Additional feedback (optional)
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tell us more about your experience..."
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || selectedScore === 0}
          className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </button>
      </div>
    </div>
  );
}
