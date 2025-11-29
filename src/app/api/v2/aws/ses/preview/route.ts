/**
 * AWS SES Email Preview API Endpoint
 * 
 * Renders email templates for preview
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderTemplate, mockSESService } from '@/lib/integrations/aws/sesService';
import { EmailTemplate, DEFAULT_SUBJECTS, isSESEnabled } from '@/lib/integrations/aws/sesConfig';
import { isFeatureEnabled } from '@/lib/features';
// Handlebars will be imported dynamically to avoid build issues
// import handlebars from 'handlebars';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { template, data } = await request.json();

    if (!template) {
      return NextResponse.json(
        { error: 'Template is required' },
        { status: 400 }
      );
    }

    // Render template
    let rendered;
    
    if (!isFeatureEnabled('AWS_SES_EMAIL')) {
      // Use mock service
      rendered = await mockSESService.renderTemplate(template as EmailTemplate, data || {});
    } else {
      rendered = await renderTemplate(template as EmailTemplate, data || {});
    }

    // Get subject
    let subject = DEFAULT_SUBJECTS[template as EmailTemplate] || 'Email Preview';
    if (data && subject.includes('{{')) {
      // Dynamic import to avoid build issues
      const handlebars = await import('handlebars');
      const subjectTemplate = handlebars.default.compile(subject);
      subject = subjectTemplate(data);
    }

    return NextResponse.json({
      template,
      subject,
      html: rendered.html,
      text: rendered.text,
    });
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SES Preview] Error:', error);
    
    return NextResponse.json(
      { error: errorMessage || 'Preview failed' },
      { status: 500 }
    );
  }
}
