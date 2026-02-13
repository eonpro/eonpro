#!/usr/bin/env bash
# =============================================================================
# Create and configure S3 bucket for Wellmedr documents (us-east-2)
# =============================================================================
# Run with: ./scripts/aws/create-wellmedr-documents-bucket.sh
# Override: BUCKET_NAME=my-bucket ./scripts/aws/create-wellmedr-documents-bucket.sh
# Requires: AWS CLI configured (aws configure) with credentials that can create buckets
# =============================================================================

set -e

# Default: wellmedr-documents. If taken globally, use BUCKET_NAME=wellmedr-documents-$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-2"
BUCKET_NAME="${BUCKET_NAME:-wellmedr-documents}"

echo "Creating S3 bucket: $BUCKET_NAME in $REGION (Ohio)"

# Create bucket (idempotent: skip if we already own it)
if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
  echo "Bucket $BUCKET_NAME already exists in this account. Applying configuration..."
else
  echo "Creating bucket..."
  if ! aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" 2>&1; then
    echo ""
    echo "If 'BucketAlreadyExists' or 'not available': name is taken by another AWS account."
    echo "Try: BUCKET_NAME=wellmedr-documents-\$(aws sts get-caller-identity --query Account --output text) ./scripts/aws/create-wellmedr-documents-bucket.sh"
    exit 1
  fi
  echo "Bucket created."
fi

# Block public access (HIPAA best practice)
echo "Configuring block public access..."
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Enable default server-side encryption (AES256)
echo "Enabling server-side encryption..."
aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'

# Enable versioning
echo "Enabling versioning..."
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration '{
    "Status": "Enabled",
    "MFADelete": "Disabled"
  }'

# CORS for EONPRO app
echo "Configuring CORS..."
aws s3api put-bucket-cors \
  --bucket "$BUCKET_NAME" \
  --cors-configuration '{
    "CORSRules": [{
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": [
        "https://app.eonpro.io",
        "https://wellmedr.eonpro.io",
        "https://ot.eonpro.io",
        "https://eonmeds.eonpro.io",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://wellmedr.localhost:3000",
        "http://ot.localhost:3000"
      ],
      "ExposeHeaders": ["ETag", "x-amz-server-side-encryption"],
      "MaxAgeSeconds": 3000
    }]
  }'

echo ""
echo "✅ Bucket $BUCKET_NAME configured successfully in $REGION"
echo ""
echo "Next: Set these in Vercel (Production env vars):"
echo "  NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true"
echo "  AWS_S3_DOCUMENTS_BUCKET_NAME=$BUCKET_NAME"
echo "  AWS_S3_BUCKET_NAME=$BUCKET_NAME"
echo "  AWS_REGION=$REGION"
echo "  AWS_ACCESS_KEY_ID=<your-iam-access-key>"
echo "  AWS_SECRET_ACCESS_KEY=<your-iam-secret>"
echo ""
echo "IAM policy: User needs s3:ListBucket, s3:GetBucketLocation, s3:PutObject, s3:GetObject, s3:DeleteObject on arn:aws:s3:::$BUCKET_NAME and arn:aws:s3:::$BUCKET_NAME/*"
echo ""
