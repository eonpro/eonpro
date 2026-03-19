/**
 * AWS SES Email - Report delivery and attachment support
 * Re-exports/wraps the SES service for scheduled report delivery.
 */

import { sendEmail } from '@/lib/integrations/aws/sesService';

export interface SendEmailWithSESParams {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
    encoding?: string;
  }>;
}

export async function sendEmailWithSES(params: SendEmailWithSESParams): Promise<void> {
  const attachments = params.attachments?.map((a) => ({
    filename: a.filename,
    content: a.encoding === 'base64' ? Buffer.from(a.content, 'base64') : a.content,
    contentType: a.contentType,
  }));

  await sendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    attachments,
  });
}
