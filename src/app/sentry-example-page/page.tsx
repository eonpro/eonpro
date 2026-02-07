'use client';

import * as Sentry from '@sentry/nextjs';
import { useState } from 'react';

/**
 * Sentry verification page.
 * Visit /sentry-example-page and click the button to trigger a test error.
 * If the error appears in Sentry Issues, the SDK is configured correctly.
 * Remove or restrict this route in production if desired.
 */
export default function SentryExamplePage() {
  const [triggered, setTriggered] = useState(false);

  const triggerClientError = () => {
    setTriggered(true);
    throw new Error('Sentry test error (client) – if you see this in Sentry, client SDK is working.');
  };

  const triggerClientCapture = () => {
    setTriggered(true);
    Sentry.captureException(new Error('Sentry captureException test (client)'));
    setTriggered(false);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Sentry verification</h1>
      <p>
        Use this page to confirm Sentry is receiving events. After clicking a button, check{' '}
        <a href="https://eonpro.sentry.io/issues/" target="_blank" rel="noopener noreferrer">
          Sentry → Issues
        </a>
        .
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={triggerClientError}
          style={{
            padding: '0.5rem 1rem',
            background: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Trigger client error (throw)
        </button>
        <button
          type="button"
          onClick={triggerClientCapture}
          style={{
            padding: '0.5rem 1rem',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Send via captureException
        </button>
      </div>
      {triggered && (
        <p style={{ marginTop: '1rem', color: '#dc2626' }}>
          Error thrown. Check Sentry Issues for the event.
        </p>
      )}
    </div>
  );
}
