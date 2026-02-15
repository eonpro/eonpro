'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorId: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    const errorId = Sentry.captureException(error);
    return {
      hasError: true,
      error,
      errorId: typeof errorId === 'string' ? errorId : null,
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      logger.error('ErrorBoundary caught an error:', error, { componentStack: errorInfo.componentStack });
    }

    // Send error to Sentry with additional context
    Sentry.withScope((scope) => {
      scope.setContext('errorBoundary', {
        componentStack: errorInfo.componentStack,
        props: JSON.stringify(this.props),
      });
      scope.setLevel('error');
      Sentry.captureException(error);
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
    });
  };

  public override render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="text-center">
              {/* Error Icon */}
              <svg
                className="mx-auto h-12 w-12 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>

              {/* Error Message */}
              <h2 className="mt-4 text-xl font-semibold text-gray-900">Something went wrong</h2>

              <p className="mt-2 text-sm text-gray-600">
                We apologize for the inconvenience. The error has been reported to our team.
              </p>

              {/* Error ID for support */}
              {this.state.errorId && (
                <div className="mt-4 rounded bg-gray-100 p-2">
                  <p className="text-xs text-gray-500">Error ID: {this.state.errorId}</p>
                </div>
              )}

              {/* Development mode: Show error details */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm text-gray-700 hover:text-gray-900">
                    Error Details (Development Only)
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-gray-100 p-2 text-xs">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  onClick={this.handleReset}
                  className="rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
                >
                  Try Again
                </button>
                <button
                  onClick={() => (window.location.href = '/')}
                  className="rounded-md bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300"
                >
                  Go Home
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// Hook for functional components to handle errors
export function useErrorHandler() {
  return (error: Error, errorInfo?: { componentStack?: string }) => {
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      logger.error('Error handled by useErrorHandler:', error, errorInfo);
    }

    // Send to Sentry
    Sentry.withScope((scope) => {
      if (errorInfo?.componentStack) {
        scope.setContext('errorInfo', errorInfo);
      }
      Sentry.captureException(error);
    });
  };
}
