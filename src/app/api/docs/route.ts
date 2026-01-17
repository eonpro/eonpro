/**
 * API Documentation Endpoint
 * Serves OpenAPI specification
 */

import { NextResponse } from 'next/server';
import openApiSpec from '@/lib/openapi/spec';

export async function GET(): Promise<Response> {
  return NextResponse.json(openApiSpec, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
