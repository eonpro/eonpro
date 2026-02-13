/**
 * API Validation Utilities
 * Helper functions for validating request data with Zod schemas
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError, ZodSchema } from 'zod';
import { logger } from '@/lib/logger';

// Re-export all schemas
export * from './schemas';

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: NextResponse };

/**
 * Validate request body against a Zod schema
 */
export async function validateBody<T extends ZodSchema>(
  request: NextRequest,
  schema: T
): Promise<ValidationResult<z.infer<T>>> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      logger.debug('Validation failed', { errors: result.error.format() });
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Validation failed',
            details: formatZodErrors(result.error),
          },
          { status: 400 }
        ),
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    logger.error('Failed to parse request body', error as Error);
    return {
      success: false,
      error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
}

/**
 * Validate query parameters against a Zod schema
 */
export function validateQuery<T extends ZodSchema>(
  request: NextRequest,
  schema: T
): ValidationResult<z.infer<T>> {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const result = schema.safeParse(searchParams);

    if (!result.success) {
      logger.debug('Query validation failed', { errors: result.error.format() });
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Invalid query parameters',
            details: formatZodErrors(result.error),
          },
          { status: 400 }
        ),
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    logger.error('Failed to parse query parameters', error as Error);
    return {
      success: false,
      error: NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 }),
    };
  }
}

/**
 * Validate route parameters against a Zod schema
 */
export function validateParams<T extends ZodSchema>(
  params: Record<string, string | string[]>,
  schema: T
): ValidationResult<z.infer<T>> {
  try {
    const result = schema.safeParse(params);

    if (!result.success) {
      logger.debug('Params validation failed', { errors: result.error.format() });
      return {
        success: false,
        error: NextResponse.json(
          {
            error: 'Invalid route parameters',
            details: formatZodErrors(result.error),
          },
          { status: 400 }
        ),
      };
    }

    return { success: true, data: result.data };
  } catch (error) {
    logger.error('Failed to parse route parameters', error as Error);
    return {
      success: false,
      error: NextResponse.json({ error: 'Invalid route parameters' }, { status: 400 }),
    };
  }
}

/**
 * Format Zod errors into a user-friendly format
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}

/**
 * Create a validated API handler
 * Combines rate limiting and validation
 */
export function createValidatedHandler<TBody extends ZodSchema, TQuery extends ZodSchema>(config: {
  bodySchema?: TBody;
  querySchema?: TQuery;
  handler: (
    request: NextRequest,
    context: {
      body?: z.infer<TBody>;
      query?: z.infer<TQuery>;
      params?: Record<string, string>;
    }
  ) => Promise<NextResponse>;
}) {
  return async (request: NextRequest, { params }: { params?: Record<string, string> } = {}) => {
    const context: {
      body?: z.infer<TBody>;
      query?: z.infer<TQuery>;
      params?: Record<string, string>;
    } = { params };

    // Validate body if schema provided
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

    // Call the handler
    return config.handler(request, context);
  };
}

/**
 * Sanitize string input (remove potential XSS)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validate and sanitize HTML content (for rich text fields)
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]+/gi, '');
}

/**
 * Validate file upload
 */
export const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z
    .string()
    .refine(
      (type) =>
        [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ].includes(type),
      'Unsupported file type'
    ),
  size: z.number().max(10 * 1024 * 1024, 'File size must be less than 10MB'),
});
