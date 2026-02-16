'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

const EONPRO_LOGO =
  'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: '#EFECE7' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '24px',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              textAlign: 'center',
            }}
          >
            {/* EonPro Logo */}
            <div style={{ marginBottom: '48px' }}>
              <img
                src={EONPRO_LOGO}
                alt="EONPRO"
                style={{ height: '32px', width: 'auto', opacity: 0.9 }}
              />
            </div>

            {/* Error Icon */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '32px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '96px',
                  height: '96px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.7)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <svg
                  width="48"
                  height="48"
                  fill="none"
                  stroke="#B8544F"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
            </div>

            {/* Error Message */}
            <h1
              style={{
                marginBottom: '12px',
                fontSize: '28px',
                fontWeight: 600,
                letterSpacing: '-0.025em',
                color: '#111827',
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                maxWidth: '360px',
                margin: '0 auto 40px',
                fontSize: '16px',
                lineHeight: 1.6,
                color: '#6B7280',
              }}
            >
              An unexpected error occurred. Our team has been notified and is
              looking into it.
            </p>

            {error.digest && (
              <p
                style={{
                  marginBottom: '24px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: '#9CA3AF',
                }}
              >
                Error ID: {error.digest}
              </p>
            )}

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                alignItems: 'center',
              }}
            >
              <button
                onClick={reset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  borderRadius: '9999px',
                  backgroundColor: '#111827',
                  padding: '12px 28px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = '#1F2937';
                }}
                onMouseOut={(e) => {
                  (e.target as HTMLButtonElement).style.backgroundColor = '#111827';
                }}
              >
                Try Again
              </button>
              <a
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(209,213,219,0.6)',
                  padding: '12px 28px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease',
                }}
              >
                Go Home
              </a>
            </div>

            {/* Footer */}
            <div style={{ marginTop: '64px' }}>
              <p style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '16px' }}>
                If this problem persists, please contact{' '}
                <a
                  href="mailto:support@eonpro.io"
                  style={{
                    color: '#6B7280',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                  }}
                >
                  support@eonpro.io
                </a>
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#9CA3AF',
                }}
              >
                Powered by
                <img
                  src={EONPRO_LOGO}
                  alt="EONPRO"
                  style={{ height: '18px', width: 'auto', opacity: 0.5 }}
                />
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
