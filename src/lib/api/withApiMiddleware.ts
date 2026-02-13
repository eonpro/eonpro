/**
 * API Middleware Wrapper
 * Combines rate limiting, validation, and error handling for API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, z } from 'zod';
import { logger } from '@/lib/logger';
import { validateBody, validateQuery } from '@/lib/validation';
import { rateLimit, strictRateLimit, standardRateLimit, relaxedRateLimit } from '@/lib/rateLimit';

type RateLimitTier = 'strict' | 'standard' | 'relaxed' | 'none';

interface ApiConfig<TBody extends ZodSchema = ZodSchema, TQuery extends ZodSchema = ZodSchema> {
  /** Rate limiting tier */
  rateLimit?: RateLimitTier;
  /** Custom rate limit config */
  rateLimitConfig?: {
    windowMs?: number;
    max?: number;
    message?: string;
  };
  /** Zod schema for request body validation */
  bodySchema?: TBody;
  /** Zod schema for query parameter validation */
  querySchema?: TQuery;
  /** Require authentication */
  requireAuth?: boolean;
  /** Required roles */
  requiredRoles?: string[];
}

interface ApiContext<TBody = unknown, TQuery = unknown> {
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  user?: {
    id: number;
    email: string;
    role: string;
    clinicId?: number;
  };
}

type ApiHandler<TBody = unknown, TQuery = unknown> = (
  request: NextRequest,
  context: ApiContext<TBody, TQuery>
) => Promise<NextResponse>;

/**
 * Create a wrapped API handler with middleware
 */
export function withApiMiddleware<
  TBody extends ZodSchema = ZodSchema,
  TQuery extends ZodSchema = ZodSchema,
>(config: ApiConfig<TBody, TQuery>, handler: ApiHandler<z.infer<TBody>, z.infer<TQuery>>) {
  // Select rate limiter
  let rateLimiter: ReturnType<typeof rateLimit> | null = null;

  if (config.rateLimitConfig) {
    rateLimiter = rateLimit(config.rateLimitConfig);
  } else {
    switch (config.rateLimit) {
      case 'strict':
        rateLimiter = strictRateLimit;
        break;
      case 'standard':
        rateLimiter = standardRateLimit;
        break;
      case 'relaxed':
        rateLimiter = relaxedRateLimit;
        break;
      case 'none':
        rateLimiter = null;
        break;
      default:
        // Default to standard rate limiting
        rateLimiter = standardRateLimit;
    }
  }

  // Create the wrapped handler
  const wrappedHandler = async (
    request: NextRequest,
    routeContext: { params?: Promise<Record<string, string>> } = {}
  ): Promise<NextResponse> => {
    const startTime = Date.now();
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

    try {
      // Await params if they're a promise (Next.js 15+)
      const params = routeContext.params ? await routeContext.params : {};

      // Build context
      const context: ApiContext<z.infer<TBody>, z.infer<TQuery>> = {
        body: undefined as z.infer<TBody>,
        query: undefined as z.infer<TQuery>,
        params: params as Record<string, string>,
      };

      // Validate body if schema provided and method allows body
      if (config.bodySchema && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const bodyResult = await validateBody(request, config.bodySchema);
        if (!bodyResult.success) {
          return bodyResult.error;
        }
        context.body = bodyResult.data;
      }

      // Validate query if schema provided
      if (config.querySchema) {
        const queryResult = validateQuery(request, config.querySchema);
        if (!queryResult.success) {
          return queryResult.error;
        }
        context.query = queryResult.data;
      }

      // Execute handler
      const response = await handler(request, context);

      // Add request ID to response
      response.headers.set('x-request-id', requestId);

      // Log request
      const duration = Date.now() - startTime;
      logger.api(request.method, request.nextUrl.pathname, {
        status: response.status,
        duration,
        requestId,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('API handler error', error as Error, {
        method: request.method,
        path: request.nextUrl.pathname,
        duration,
        requestId,
      });

      return NextResponse.json(
        {
          error: 'Internal server error',
          requestId,
        },
        { status: 500 }
      );
    }
  };

  // Apply rate limiting if configured
  if (rateLimiter) {
    return rateLimiter(wrappedHandler);
  }

  return wrappedHandler;
}

/**
 * Shorthand for creating GET handlers
 */
export function createGetHandler<TQuery extends ZodSchema = ZodSchema>(
  config: Omit<ApiConfig<never, TQuery>, 'bodySchema'>,
  handler: ApiHandler<never, z.infer<TQuery>>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withApiMiddleware(config, handler as ApiHandler<any, z.infer<TQuery>>);
}

/**
 * Shorthand for creating POST handlers
 */
export function createPostHandler<TBody extends ZodSchema = ZodSchema>(
  config: Omit<ApiConfig<TBody, never>, 'querySchema'>,
  handler: ApiHandler<z.infer<TBody>, never>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withApiMiddleware(config, handler as ApiHandler<z.infer<TBody>, any>);
}

/**
 * Apply rate limiting to an existing handler
 */
export function withRateLimit(
  tier: RateLimitTier,
  handler: (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> }
  ) => Promise<NextResponse>
) {
  switch (tier) {
    case 'strict':
      return strictRateLimit(handler);
    case 'standard':
      return standardRateLimit(handler);
    case 'relaxed':
      return relaxedRateLimit(handler);
    case 'none':
      return handler;
    default:
      return standardRateLimit(handler);
  }
}
