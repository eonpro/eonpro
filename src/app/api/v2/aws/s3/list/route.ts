/**
 * AWS S3 List API Endpoint
 *
 * Lists files from S3 with filtering options
 */

import { NextRequest, NextResponse } from 'next/server';
import { listS3Files, mockS3Service } from '@/lib/integrations/aws/s3Service';
import {
  FileCategory,
  FileAccessLevel,
  isS3Enabled,
  S3_ERRORS,
} from '@/lib/integrations/aws/s3Config';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as FileCategory | null;
    const accessLevel = searchParams.get('accessLevel') as FileAccessLevel | null;
    const patientId = searchParams.get('patientId');
    const maxKeys = parseInt(searchParams.get('maxKeys') || '100');

    // Build prefix based on filters
    let prefix = '';
    if (patientId) {
      prefix = `patients/${patientId}/`;
    } else if (category) {
      prefix = category + '/';
    }

    // Check if feature is enabled
    if (!isFeatureEnabled('AWS_S3_STORAGE')) {
      // Use mock service
      const mockFiles = await mockS3Service.listS3Files(prefix || 'mock');

      // Mock document list
      return NextResponse.json(
        [
          {
            id: 'mock-1',
            name: 'Patient_Intake_Form.pdf',
            category: FileCategory.INTAKE_FORMS,
            size: 256000,
            uploadedAt: new Date('2024-01-15T10:30:00'),
            uploadedBy: 'Dr. Smith',
            accessLevel: FileAccessLevel.PRIVATE,
            key: 'patients/123/intake-forms/patient_intake.pdf',
            url: 'https://mock-s3.lifefile.com/patient_intake.pdf',
            patientId: 123,
            patientName: 'John Doe',
            version: 1,
          },
          {
            id: 'mock-2',
            name: 'Lab_Results_CBC.pdf',
            category: FileCategory.LAB_RESULTS,
            size: 128000,
            uploadedAt: new Date('2024-02-10T14:20:00'),
            uploadedBy: 'Lab Tech',
            accessLevel: FileAccessLevel.RESTRICTED,
            key: 'patients/124/lab-results/cbc_results.pdf',
            url: 'https://mock-s3.lifefile.com/cbc_results.pdf',
            patientId: 124,
            patientName: 'Jane Smith',
            version: 1,
          },
          {
            id: 'mock-3',
            name: 'Prescription_Record.pdf',
            category: FileCategory.PRESCRIPTIONS,
            size: 64000,
            uploadedAt: new Date('2024-03-05T09:15:00'),
            uploadedBy: 'Dr. Johnson',
            accessLevel: FileAccessLevel.PROVIDER,
            key: 'patients/125/prescriptions/rx_record.pdf',
            url: 'https://mock-s3.lifefile.com/rx_record.pdf',
            patientId: 125,
            patientName: 'Bob Wilson',
            version: 2,
          },
          ...mockFiles.map((file, idx) => ({
            id: `mock-${idx + 4}`,
            name: file.key.split('/').pop() || 'Unknown',
            category: FileCategory.OTHER,
            size: file.size,
            uploadedAt: file.lastModified,
            uploadedBy: 'System',
            accessLevel: FileAccessLevel.PRIVATE,
            key: file.key,
            url: file.url,
          })),
        ].filter((doc: any) => {
          if (category && doc.category !== category) return false;
          if (accessLevel && doc.accessLevel !== accessLevel) return false;
          if (patientId && 'patientId' in doc && doc.patientId !== parseInt(patientId))
            return false;
          return true;
        })
      );
    }

    // Check if S3 is configured
    if (!isS3Enabled()) {
      return NextResponse.json({ error: S3_ERRORS.NOT_CONFIGURED }, { status: 503 });
    }

    // List files from S3
    const files = await listS3Files(prefix, maxKeys);

    // Transform S3 files to document format
    // In production, you would fetch additional metadata from database
    const documents = files.map((file, index) => {
      // Parse metadata from key structure
      const parts = file.key.split('/');
      const fileName = parts[parts.length - 1];
      const category =
        parts.includes('patients') && parts.length > 2
          ? (parts[2] as FileCategory)
          : FileCategory.OTHER;

      return {
        id: `s3-${index}`,
        name: fileName,
        category,
        size: file.size,
        uploadedAt: file.lastModified,
        uploadedBy: 'Unknown', // Would come from database
        accessLevel: FileAccessLevel.PRIVATE, // Would come from metadata
        key: file.key,
        url: file.url,
        etag: file.etag,
      };
    });

    return NextResponse.json(documents);
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[S3 List] Error:', error);

    return NextResponse.json({ error: errorMessage || 'Failed to list files' }, { status: 500 });
  }
}
