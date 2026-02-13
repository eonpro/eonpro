# AWS S3 Storage Integration

## Overview

The AWS S3 integration provides secure cloud storage for medical documents, lab results, imaging,
prescriptions, and other healthcare files.

## Features

- **Secure File Storage**: Server-side AES256 encryption for all files
- **Intelligent Tiering**: Automatic cost optimization with S3 Intelligent Tiering
- **Pre-signed URLs**: Secure temporary URLs for direct uploads/downloads
- **File Categorization**: Automatic organization by file type (medical records, lab results, etc.)
- **Drag & Drop Upload**: User-friendly file upload with progress tracking
- **Mock Service**: Full testing capability without AWS credentials

## Configuration

### Environment Variables

Add the following to your `.env.local` file:

```env
# Feature Flag (REQUIRED for document uploads)
NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true

# AWS Credentials (REQUIRED for production - uses mock service if not provided in dev)
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
# Bucket for patient/intake documents (takes precedence if set)
AWS_S3_DOCUMENTS_BUCKET_NAME=your-documents-bucket-name
# Or use a single bucket for all S3 usage
AWS_S3_BUCKET_NAME=your-bucket-name

# Optional
AWS_CLOUDFRONT_URL=https://your-cloudfront-domain.com
AWS_KMS_KEY_ID=your-kms-key-id  # For KMS encryption
```

> **Important:** In production (Vercel), S3 storage is **required** for document uploads because the
> filesystem is read-only. Without proper S3 configuration, document uploads will fail with a 503
> error.

### S3 Bucket Setup

1. Create an S3 bucket in your AWS account
2. Enable versioning for backup/recovery
3. Configure CORS for browser uploads:

```json
{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

## File Categories

- `medical-records`: General medical documents
- `prescriptions`: Prescription documents
- `lab-results`: Laboratory test results
- `imaging`: X-rays, MRIs, CT scans, etc.
- `insurance`: Insurance cards and documents
- `consent-forms`: Patient consent forms
- `intake-forms`: Patient intake questionnaires
- `invoices`: Billing and invoice documents
- `other`: Uncategorized files

## File Limits

- **Maximum file size**: 50MB
- **Maximum image size**: 10MB
- **Maximum document size**: 25MB
- **Supported image types**: JPEG, PNG, GIF, WebP, SVG
- **Supported document types**: PDF, Word, Excel, Text, CSV
- **Supported medical types**: DICOM

## Usage

### Upload Files

```typescript
import { FileUploader } from '@/components/aws/FileUploader';

<FileUploader
  category={FileCategory.MEDICAL_RECORDS}
  entityId="patient-123"
  entityType="patient"
  multiple={true}
  maxFiles={5}
  onUploadComplete={(data) => console.log('Uploaded:', data)}
  onError={(error) => console.error('Error:', error)}
/>
```

### Download Files

```typescript
// Get pre-signed URL
const response = await fetch(`/api/v2/aws/s3/download?key=${fileKey}&presigned=true`);
const { url } = await response.json();
window.open(url, '_blank');

// Direct download
const response = await fetch(`/api/v2/aws/s3/download?key=${fileKey}`);
const blob = await response.blob();
// Process blob...
```

### List Files

```typescript
const response = await fetch('/api/v2/aws/s3/list?prefix=patients/123');
const { files } = await response.json();
```

### Delete Files

```typescript
const response = await fetch('/api/v2/aws/s3/delete', {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: fileKey }),
});
```

## API Endpoints

### Upload File

`POST /api/v2/aws/s3/upload`

- **Body**: FormData with file, category, entityId, entityType
- **Response**: File metadata with S3 key and URLs

### Download File

`GET /api/v2/aws/s3/download`

- **Query**: `key` (required), `presigned` (optional), `expires` (optional)
- **Response**: File content or pre-signed URL

### List Files

`GET /api/v2/aws/s3/list`

- **Query**: `prefix` (optional), `maxKeys` (optional)
- **Response**: Array of file metadata

### Delete File

`DELETE /api/v2/aws/s3/delete`

- **Body**: `{ key: string }`
- **Response**: Success status

### Get Stats

`GET /api/v2/aws/s3/stats`

- **Response**: Storage statistics and recent uploads

### Check Configuration

`GET /api/v2/aws/s3/config`

- **Response**: Configuration status and settings

## Security

### Encryption

- All files encrypted at rest using AES256
- SSL/TLS for data in transit
- Optional client-side encryption before upload

### Access Control

- Private ACL for all objects
- Pre-signed URLs expire after 1 hour (configurable)
- Block public access enabled by default

### File Validation

- MIME type validation
- File size limits enforced
- Malware scanning (if AWS GuardDuty enabled)

## Testing

### Test Page

Access the comprehensive test suite at `/test/s3` which includes:

- Feature flag validation
- Configuration checks
- Upload/download operations
- Pre-signed URL generation
- File listing and metadata
- Large file handling
- Encryption verification

### Mock Service

When AWS credentials are not configured:

- Simulates all S3 operations
- Returns mock file data
- Logs operations to console
- Perfect for development/testing

## Storage Management

### Admin Interface

Access `/storage` for:

- View storage statistics
- Browse uploaded files
- Upload new files
- Download/delete files
- Filter by category
- Search by filename

### Folder Structure

```
bucket/
├── patients/
│   ├── {patientId}/
│   │   ├── medical-records/
│   │   ├── lab-results/
│   │   ├── imaging/
│   │   ├── forms/
│   │   ├── insurance/
│   │   └── billing/
├── providers/
├── appointments/
├── prescriptions/
├── temp/
└── archived/
```

## Cost Optimization

### Intelligent Tiering

Files automatically transition between:

- **Frequent Access**: Immediate access
- **Infrequent Access**: Lower cost, millisecond access
- **Archive Instant**: Lowest cost, millisecond access

### Lifecycle Policies

Consider implementing:

- Delete temp files after 7 days
- Archive old files after 90 days
- Transition to Glacier for long-term storage

## Monitoring

### CloudWatch Metrics

- Storage usage
- Request count
- Bandwidth usage
- Error rates

### Audit Logging

- S3 access logging enabled
- CloudTrail for API calls
- Application-level logging

## Troubleshooting

### Common Issues

1. **"S3 not configured" error**
   - Check environment variables
   - Verify AWS credentials
   - Ensure bucket exists

2. **Upload fails**
   - Check file size limits
   - Verify MIME type allowed
   - Check network connection

3. **Access denied**
   - Verify IAM permissions
   - Check bucket policy
   - Ensure CORS configured

4. **Slow uploads**
   - Use multipart upload for large files
   - Check network bandwidth
   - Consider S3 Transfer Acceleration

## Best Practices

1. **Use categories**: Always categorize files appropriately
2. **Add metadata**: Include relevant metadata for searchability
3. **Handle errors**: Implement retry logic for network failures
4. **Monitor usage**: Track storage costs and usage patterns
5. **Clean up**: Regularly remove unnecessary files
6. **Backup critical data**: Enable versioning and cross-region replication
7. **Optimize images**: Compress images before upload
8. **Use CDN**: Configure CloudFront for frequently accessed files

## Compliance

### HIPAA Compliance

- Enable encryption at rest and in transit
- Sign AWS Business Associate Agreement (BAA)
- Use dedicated S3 buckets for PHI
- Enable access logging and monitoring
- Implement data retention policies
- Regular security audits

### Data Privacy

- Patient data remains in specified region
- Implement data deletion policies
- Support patient data export requests
- Maintain audit trail of access
