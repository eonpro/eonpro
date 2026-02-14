/**
 * Shared HTTP Error Response Utilities
 *
 * Consistent error response format across all API routes.
 * Always includes requestId for correlation when available.
 *
 * @module api/error-response
 */

import { NextResponse } from 'next/server';
import { getRequestId } from '@/lib/observability/request-context';

interface ErrorBody {
  error: string;
  code?: string;
  requestId?: string;
  details?: unknown;
  retryAfter?: number;
}

function buildErrorBody(message: string, opts?: {
  code?: string;
  details?: unknown;
  retryAfter?: number;
}): ErrorBody {
  const requestId = getRequestId();
  return {
    error: message,
    ...(opts?.code && { code: opts.code }),
    ...(requestId !== 'no-request-id' && { requestId }),
    ...(opts?.details !== undefined && { details: opts.details }),
    ...(opts?.retryAfter !== undefined && { retryAfter: opts.retryAfter }),
  };
}

/** 400 Bad Request */
export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    buildErrorBody(message, { code: 'BAD_REQUEST', details }),
    { status: 400 }
  );
}

/** 401 Unauthorized */
export function unauthorized(message: string = 'Authentication required') {
  return NextResponse.json(
    buildErrorBody(message, { code: 'UNAUTHORIZED' }),
    { status: 401 }
  );
}

/** 403 Forbidden */
export function forbidden(message: string = 'Insufficient permissions') {
  return NextResponse.json(
    buildErrorBody(message, { code: 'FORBIDDEN' }),
    { status: 403 }
  );
}

/** 404 Not Found */
export function notFound(message: string = 'Resource not found') {
  return NextResponse.json(
    buildErrorBody(message, { code: 'NOT_FOUND' }),
    { status: 404 }
  );
}

/** 409 Conflict */
export function conflict(message: string, details?: unknown) {
  return NextResponse.json(
    buildErrorBody(message, { code: 'CONFLICT', details }),
    { status: 409 }
  );
}

/** 422 Unprocessable Entity (validation errors) */
export function unprocessable(message: string, details?: unknown) {
  return NextResponse.json(
    buildErrorBody(message, { code: 'VALIDATION_ERROR', details }),
    { status: 422 }
  );
}

/** 429 Too Many Requests */
export function tooManyRequests(message: string = 'Too many requests', retryAfter?: number) {
  return NextResponse.json(
    buildErrorBody(message, { code: 'RATE_LIMIT_EXCEEDED', retryAfter }),
    { status: 429 }
  );
}

/** 500 Internal Server Error */
export function serverError(message: string = 'Internal server error') {
  return NextResponse.json(
    buildErrorBody(message, { code: 'INTERNAL_ERROR' }),
    { status: 500 }
  );
}

/** 503 Service Unavailable */
export function serviceUnavailable(message: string = 'Service temporarily unavailable', retryAfter?: number) {
  return NextResponse.json(
    buildErrorBody(message, { code: 'SERVICE_UNAVAILABLE', retryAfter }),
    { status: 503 }
  );
}
