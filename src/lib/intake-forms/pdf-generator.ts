import puppeteer from 'puppeteer';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { uploadToS3 } from '@/lib/integrations/aws/s3Service';
import { FileCategory } from '@/lib/integrations/aws/s3Config';
import { storeIntakeData } from '@/lib/storage/document-data-store';

// Helper to build sections array from submission (for PatientIntakeView display)
function buildSectionsFromSubmission(
  submission: any
): Array<{ title: string; entries: Array<{ id: string; label: string; value: any }> }> {
  const sections: Record<string, Array<{ id: string; label: string; value: any }>> = {};

  for (const response of submission.responses || []) {
    const section = response.question?.section || 'General';
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push({
      id: String(response.questionId),
      label: response.question?.questionText || 'Unknown Question',
      value: response.answer || response.value || '',
    });
  }

  return Object.entries(sections).map(([title, entries]) => ({ title, entries }));
}

// Helper to build flat answers array from submission (for PatientIntakeView display)
function buildAnswersFromSubmission(
  submission: any
): Array<{ id: string; label: string; value: any }> {
  return (submission.responses || []).map((response: any) => ({
    id: String(response.questionId),
    label: response.question?.questionText || 'Unknown Question',
    value: response.answer || response.value || '',
  }));
}

interface PDFGenerationOptions {
  submissionId: number;
  includeLogo?: boolean;
  includeTimestamp?: boolean;
}

export async function generateIntakeFormPDF(options: PDFGenerationOptions): Promise<Buffer | null> {
  const { submissionId, includeLogo = true, includeTimestamp = true } = options;

  try {
    // Fetch submission data with all related data
    const submission = await prisma.intakeFormSubmission.findUnique({
      where: { id: submissionId },
      include: {
        patient: true,
        template: {
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        responses: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!submission) {
      throw new Error('Submission not found');
    }

    // Generate HTML content for the PDF
    const html = generateHTML(submission, { includeLogo, includeTimestamp });

    const PDF_TIMEOUT_MS = 30_000;
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    let pdfBuffer: Uint8Array;

    try {
      browser = await Promise.race([
        puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Puppeteer launch timed out after 30s')), PDF_TIMEOUT_MS)
        ),
      ]);

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: PDF_TIMEOUT_MS });

      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }

    // Save PDF to patient documents
    const fileName = `intake_form_${submission.template.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

    // Build intake data structure for display in Intake tab (same format as webhook intakes)
    const patientData = submission.patient;
    const intakeDataToStore = {
      submissionId: String(submissionId),
      source: 'eonpro-intake-form',
      receivedAt: new Date().toISOString(),
      sections: buildSectionsFromSubmission(submission),
      answers: buildAnswersFromSubmission(submission),
      patient: {
        email: patientData?.email,
        firstName: patientData?.firstName,
        lastName: patientData?.lastName,
        phone: patientData?.phone,
        dob: patientData?.dob,
        gender: patientData?.gender,
      },
    };

    // Upload PDF to S3 (serverless-safe — no ephemeral filesystem writes)
    const s3Result = await uploadToS3({
      file: pdfBuffer as Buffer,
      fileName,
      category: FileCategory.INTAKE_FORMS,
      patientId: submission.patientId,
      contentType: 'application/pdf',
      metadata: {
        submissionId: String(submissionId),
        templateName: submission.template.name,
      },
    });

    // Dual-write: S3 + DB `data` column (Phase 3.3)
    const { s3DataKey, dataBuffer: intakeDataBuffer } = await storeIntakeData(
      intakeDataToStore,
      { patientId: submission.patientId, clinicId: null }
    );

    // Create patient document record with intake data and S3 location
    // Store the S3 key in externalUrl (signed URLs expire; regenerate from key on access)
    await prisma.patientDocument.create({
      data: {
        patientId: submission.patientId,
        filename: fileName,
        mimeType: 'application/pdf',
        category: 'MEDICAL_INTAKE_FORM',
        externalUrl: s3Result.key,
        source: 'System',
        sourceSubmissionId: String(submissionId),
        data: intakeDataBuffer,
        s3DataKey,
      },
    });

    logger.info('Generated PDF for intake form submission', { submissionId });

    return pdfBuffer as Buffer;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to generate PDF', { error, submissionId });
    return null;
  }
}

function generateHTML(
  submission: any,
  options: { includeLogo: boolean; includeTimestamp: boolean }
): string {
  const { template, patient, responses, submittedAt } = submission;

  // Group responses by section
  const responsesByQuestion = new Map();
  responses.forEach((response: any) => {
    responsesByQuestion.set(response.questionId, response.responseText);
  });

  const sections: Record<string, any[]> = {};
  template.questions.forEach((question: any) => {
    const section = question.section || 'General Information';
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push({
      ...question,
      response: responsesByQuestion.get(question.id) || 'Not answered',
    });
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${template.name} - ${patient.firstName} ${patient.lastName}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          margin-bottom: 30px;
        }
        .header h1 {
          font-size: 24px;
          margin-bottom: 10px;
        }
        .header .subtitle {
          font-size: 14px;
          opacity: 0.9;
        }
        .patient-info {
          background: #f7f7f7;
          padding: 20px;
          margin-bottom: 30px;
          border-radius: 8px;
        }
        .patient-info h2 {
          font-size: 18px;
          margin-bottom: 15px;
          color: #555;
        }
        .patient-info .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .patient-info .info-item {
          font-size: 14px;
        }
        .patient-info .info-item strong {
          font-weight: 600;
          margin-right: 5px;
        }
        .section {
          margin-bottom: 30px;
          page-break-inside: avoid;
        }
        .section h3 {
          font-size: 18px;
          color: #667eea;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 2px solid #e0e0e0;
        }
        .question {
          margin-bottom: 20px;
        }
        .question-text {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #555;
        }
        .question-text .required {
          color: #e53e3e;
        }
        .response {
          font-size: 14px;
          padding: 10px;
          background: #f9f9f9;
          border-left: 3px solid #667eea;
          border-radius: 4px;
        }
        .response.empty {
          color: #999;
          font-style: italic;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
        .timestamp {
          margin-top: 10px;
          font-size: 11px;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${template.name}</h1>
        <div class="subtitle">${template.description || 'Medical Intake Form'}</div>
      </div>

      <div class="patient-info">
        <h2>Patient Information</h2>
        <div class="info-grid">
          <div class="info-item">
            <strong>Name:</strong> ${patient.firstName} ${patient.lastName}
          </div>
          <div class="info-item">
            <strong>Email:</strong> ${patient.email}
          </div>
          <div class="info-item">
            <strong>Phone:</strong> ${patient.phoneNumber || 'Not provided'}
          </div>
          <div class="info-item">
            <strong>Date of Birth:</strong> ${patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'Not provided'}
          </div>
        </div>
      </div>

      ${Object.entries(sections)
        .map(
          ([sectionName, questions]) => `
        <div class="section">
          <h3>${sectionName}</h3>
          ${questions
            .map(
              (q: any) => `
            <div class="question">
              <div class="question-text">
                ${q.questionText}
                ${q.isRequired ? '<span class="required">*</span>' : ''}
              </div>
              <div class="response ${!q.response || q.response === 'Not answered' ? 'empty' : ''}">
                ${formatResponse(q.response, q.questionType)}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
        )
        .join('')}

      <div class="footer">
        <p>This form was submitted electronically through ${process.env.NEXT_PUBLIC_CLINIC_NAME || 'EONPro'}</p>
        ${
          options.includeTimestamp
            ? `
          <div class="timestamp">
            Submitted on: ${new Date(submittedAt).toLocaleString()}
            <br>
            Document generated on: ${new Date().toLocaleString()}
          </div>
        `
            : ''
        }
      </div>
    </body>
    </html>
  `;
}

function formatResponse(response: string, questionType: string): string {
  if (!response || response === 'Not answered') {
    return 'Not answered';
  }

  // Format date responses
  if (questionType === 'date') {
    try {
      return new Date(response).toLocaleDateString();
    } catch {
      return response;
    }
  }

  // Format checkbox responses (comma-separated)
  if (questionType === 'checkbox' && response.includes(',')) {
    const items = response.split(',').map((item: any) => item.trim());
    return items.map((item: any) => `• ${item}`).join('<br>');
  }

  // Format long text responses
  if (questionType === 'textarea') {
    return response.replace(/\n/g, '<br>');
  }

  return response;
}

// Export function to automatically generate PDF on form submission
export async function generatePDFOnSubmission(submissionId: number): Promise<void> {
  try {
    await generateIntakeFormPDF({ submissionId });
    logger.info('PDF generated automatically for submission', { submissionId });
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to auto-generate PDF', { error, submissionId });
  }
}
