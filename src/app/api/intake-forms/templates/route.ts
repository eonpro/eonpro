/**
 * API Routes for Intake Form Templates
 * GET: List all templates
 * POST: Create a new template
 */

import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { createFormTemplate, getFormTemplates } from '@/lib/intake-forms/service';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Validation schema for creating a template
const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  treatmentType: z.string().min(1, 'Treatment type is required'),
  questions: z.array(
    z.object({
      questionText: z.string().min(1, 'Question text is required'),
      questionType: z.enum([
        'text',
        'textarea',
        'select',
        'radio',
        'checkbox',
        'date',
        'number',
        'email',
        'phone',
        'signature',
        'file',
      ]),
      options: z.any().optional(),
      isRequired: z.boolean().optional(),
      validation: z.any().optional(),
      placeholder: z.string().optional(),
      helpText: z.string().optional(),
      orderIndex: z.number(),
      section: z.string().optional(),
      conditionalLogic: z.any().optional(),
    })
  ),
  metadata: z.any().optional(),
});

/**
 * GET /api/intake-forms/templates
 * Get all active form templates
 */
export const GET = withProviderAuth(async (req: NextRequest, user) => {
  try {
    const providerId = user.role === 'provider' ? user.providerId : undefined;
    const templates = await getFormTemplates(providerId);

    return NextResponse.json({
      templates,
      meta: {
        count: templates.length,
        accessedBy: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to get form templates', error);
    return NextResponse.json(
      { error: 'Failed to get form templates' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/intake-forms/templates
 * Create a new form template
 */
export const POST = withProviderAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    
    // Validate the request body
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const providerId = user.role === 'provider' ? user.providerId : body.providerId;
    
    const template = await createFormTemplate(
      parsed.data as any,  // Type assertion since we validated with zod
      user.id || undefined,  // Make sure it's undefined if not present
      providerId || undefined
    );

    return NextResponse.json({
      template,
      message: 'Form template created successfully',
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to create form template', error);
    return NextResponse.json(
      { error: 'Failed to create form template' },
      { status: 500 }
    );
  }
});