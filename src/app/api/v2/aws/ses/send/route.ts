/**
 * AWS SES Send Email API Endpoint
 * 
 * Sends single or bulk emails through AWS SES
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  sendEmail, 
  sendBulkEmails,
  mockSESService,
} from '@/lib/integrations/aws/sesService';
import { 
  EmailTemplate,
  EmailPriority,
  isSESEnabled,
  validateEmail,
  SES_ERRORS,
} from '@/lib/integrations/aws/sesConfig';
import { isFeatureEnabled } from '@/lib/features';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Single email
    if (body.to) {
      // Validate required fields
      if (!body.to) {
        return NextResponse.json(
          { error: 'Recipient email is required' },
          { status: 400 }
        );
      }
      
      // Validate email format
      const recipients = Array.isArray(body.to) ? body.to : [body.to];
      for (const email of recipients) {
        if (!validateEmail(email)) {
          return NextResponse.json(
            { error: `${SES_ERRORS.INVALID_EMAIL}: ${email}` },
            { status: 400 }
          );
        }
      }
      
      // Check if feature is enabled
      if (!isFeatureEnabled('AWS_SES_EMAIL')) {
        // Use mock service
        const result = await mockSESService.sendEmail({
          to: body.to,
          subject: body.subject,
          template: body.template as EmailTemplate,
          templateData: body.templateData,
          html: body.html,
          text: body.text,
          cc: body.cc,
          bcc: body.bcc,
          replyTo: body.replyTo,
          priority: body.priority as EmailPriority,
          tags: body.tags,
        });
        
        return NextResponse.json({
          ...result,
          message: '⚠️ Using mock SES service (feature not enabled)',
        });
      }
      
      // Check if SES is configured
      if (!isSESEnabled()) {
        return NextResponse.json(
          { error: SES_ERRORS.NOT_CONFIGURED },
          { status: 503 }
        );
      }
      
      // Send email
      const result = await sendEmail({
        to: body.to,
        subject: body.subject,
        template: body.template as EmailTemplate,
        templateData: body.templateData,
        html: body.html,
        text: body.text,
        cc: body.cc,
        bcc: body.bcc,
        replyTo: body.replyTo,
        priority: body.priority as EmailPriority,
        tags: body.tags,
      });
      
      if (result.status === 'failed') {
        return NextResponse.json(
          { error: result.error || SES_ERRORS.SEND_FAILED },
          { status: 500 }
        );
      }
      
      return NextResponse.json(result);
    }
    
    // Bulk emails
    if (body.recipients && body.template) {
      // Validate recipients
      if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
        return NextResponse.json(
          { error: 'Recipients array is required for bulk email' },
          { status: 400 }
        );
      }
      
      for (const recipient of body.recipients) {
        if (!validateEmail(recipient.email)) {
          return NextResponse.json(
            { error: `${SES_ERRORS.INVALID_EMAIL}: ${recipient.email}` },
            { status: 400 }
          );
        }
      }
      
      // Check if feature is enabled
      if (!isFeatureEnabled('AWS_SES_EMAIL')) {
        // Use mock service for bulk
        const mockResults = await Promise.all(
          body.recipients.map((r: any) => 
            mockSESService.sendEmail({
              to: r.email,
              template: body.template,
              templateData: { ...body.defaultData, ...r.data },
            })
          )
        );
        
        return NextResponse.json({
          results: mockResults,
          message: '⚠️ Using mock SES service (feature not enabled)',
        });
      }
      
      // Check if SES is configured
      if (!isSESEnabled()) {
        return NextResponse.json(
          { error: SES_ERRORS.NOT_CONFIGURED },
          { status: 503 }
        );
      }
      
      // Send bulk emails
      const results = await sendBulkEmails(
        body.recipients,
        body.template as EmailTemplate,
        body.defaultData
      );
      
      const successful = results.filter((r: any) => r.status === 'sent').length;
      const failed = results.filter((r: any) => r.status === 'failed').length;
      
      return NextResponse.json({
        results,
        summary: {
          total: results.length,
          successful,
          failed,
        },
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid request. Provide either "to" for single email or "recipients" for bulk email.' },
      { status: 400 }
    );
  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[SES Send] Error:', error);
    
    return NextResponse.json(
      { error: errorMessage || SES_ERRORS.SEND_FAILED },
      { status: 500 }
    );
  }
}
