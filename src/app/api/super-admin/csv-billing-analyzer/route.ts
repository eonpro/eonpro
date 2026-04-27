import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import Papa from 'papaparse';
import { analyzeCsv } from '@/lib/billing-analysis/csv-analyzer';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const POST = withSuperAdminAuth(async (req: NextRequest, _user: AuthUser) => {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Expected multipart/form-data with a CSV file' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No CSV file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 50 MB.` },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
      return NextResponse.json({ error: 'Only CSV or TXT files are accepted' }, { status: 400 });
    }

    const text = await file.text();

    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return NextResponse.json(
        {
          error: 'CSV parsing failed',
          details: parsed.errors.slice(0, 10).map((e) => e.message),
        },
        { status: 400 }
      );
    }

    if (parsed.data.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 });
    }

    logger.info('[SuperAdmin] CSV billing analysis started', {
      fileName: file.name,
      rows: parsed.data.length,
      columns: parsed.meta.fields?.length ?? 0,
    });

    const result = analyzeCsv(parsed.data);

    logger.info('[SuperAdmin] CSV billing analysis complete', {
      fileName: file.name,
      totalRows: result.summary.totalRows,
      totalIssues: result.summary.totalIssues,
      errors: result.summary.issuesByServerity.error,
      warnings: result.summary.issuesByServerity.warning,
    });

    return NextResponse.json({
      data: {
        summary: result.summary,
        issues: result.issues,
        patients: result.patients,
        medications: result.medications,
      },
      meta: {
        fileName: file.name,
        parsedRows: parsed.data.length,
        parseErrors: parsed.errors.length,
        columns: parsed.meta.fields ?? [],
      },
    });
  } catch (error) {
    logger.error('[SuperAdmin] CSV billing analysis error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to analyze CSV' }, { status: 500 });
  }
});

export const GET = withSuperAdminAuth(async (_req: NextRequest, _user: AuthUser) => {
  return NextResponse.json({
    message: 'CSV Billing Analyzer API',
    usage: 'POST a CSV file as multipart/form-data with field name "file"',
    maxSize: '50 MB',
    supportedFormats: ['csv', 'txt'],
  });
});
