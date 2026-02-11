# Document Upload 503 — Step-by-Step Runbook

When `POST /api/patients/:id/documents` returns **503 (Service Unavailable)**, document storage (AWS S3) is not correctly configured or the upload is failing. Follow these steps in order.

---

## Step 1: Verify Environment Variables in Vercel

In **Vercel Dashboard** → your project (eonpro) → **Settings** → **Environment Variables**, confirm these are set for **Production** (and Preview if you test there):

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE` | ✅ | `true` | Must be exactly `true` (string). **Triggers rebuild** — change requires redeploy. |
| `AWS_ACCESS_KEY_ID` | ✅ | `AKIA...` | IAM user access key. |
| `AWS_SECRET_ACCESS_KEY` | ✅ | (secret) | IAM user secret key. |
| `AWS_REGION` | ✅ | `us-east-2` | Region where the bucket lives. Must match bucket. |
| `AWS_S3_DOCUMENTS_BUCKET_NAME` | ✅ | `wellmedr-documents` | Primary bucket for patient documents. Must match `AWS_REGION`. |
| `AWS_S3_BUCKET_NAME` | Fallback | `wellmedr-documents` | Used if `AWS_S3_DOCUMENTS_BUCKET_NAME` is not set. |

**No other variables are required** for basic document upload. `AWS_KMS_KEY_ID` and `AWS_CLOUDFRONT_URL` are optional.

---

## Step 2: Redeploy After Changing NEXT_PUBLIC_ Variables

`NEXT_PUBLIC_*` variables are **inlined at build time**. If you added or changed `NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE`:

1. Go to **Vercel** → **Deployments**.
2. **Redeploy** the latest deployment (or push a commit to trigger a new build).
3. Wait for the build to complete and production to update.

---

## Step 3: Run the Diagnostic Endpoint

While logged in as **admin** or **provider**, open:

```
GET https://app.eonpro.io/api/diagnostics/document-upload
```

Or use curl with your Bearer token:

```bash
curl -s -H "Authorization: Bearer YOUR_TOKEN" \
  "https://app.eonpro.io/api/diagnostics/document-upload"
```

Interpret the response:

| `ok` | Meaning |
|------|---------|
| `true` | S3 is configured and the bucket is reachable. If upload still fails, go to Step 5. |
| `false` | Check `suggestions` in the response and fix the items listed. |

Example when something is wrong:

```json
{
  "ok": false,
  "diagnostics": {
    "featureEnabled": true,
    "hasBucket": true,
    "hasCredentials": true,
    "hasRegion": true,
    "configured": true,
    "enabled": true,
    "headBucketOk": false,
    "awsErrorCode": "AccessDenied",
    "headBucketError": "Access Denied (status code: 403)"
  },
  "suggestions": [
    "IAM user needs s3:ListBucket (HeadBucket) and s3:PutObject on the bucket."
  ]
}
```

---

## Step 4: Fix AWS IAM and Bucket

### 4a. Bucket Exists

If `awsErrorCode` is `NotFound` or `NoSuchBucket`:

1. Open **AWS Console** → **S3**.
2. Confirm the bucket name matches `AWS_S3_DOCUMENTS_BUCKET_NAME` (e.g. `intakesnew`).
3. Create the bucket in the same region as `AWS_REGION` (e.g. `us-east-2`) if it does not exist.

### 4b. IAM Permissions

The IAM user whose keys are in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` must have at least:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

Replace `YOUR_BUCKET_NAME` with your bucket (e.g. `intakesnew`).

### 4c. Region Match

`AWS_REGION` must match the bucket’s region. A bucket in `us-east-2` requires `AWS_REGION=us-east-2`.

---

## Step 5: Check Vercel Logs for Actual Error

If the diagnostic returns `ok: true` but uploads still return 503:

1. Go to **Vercel** → **Logs**.
2. Filter by the failed request (e.g. `POST .../documents`, status 503).
3. Open the log entry and inspect the **Function** / **Error** section.
4. Search for `[S3] Upload failed:` or `Error uploading documents` — the underlying AWS error will be in the stack trace or message.

Common AWS causes:

| Log message / code | Fix |
|--------------------|-----|
| `AccessDenied` / 403 | IAM policy missing `s3:PutObject` or wrong bucket/resource. |
| `NoSuchBucket` | Bucket name typo or bucket in different region. |
| `RequestTimeout` / `TimeoutError` | Network or cold start; retry or increase function duration. |
| `CredentialsError` | Invalid or rotated keys; update `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. |

---

## Step 6: File Size and Type

- **App limit:** 10MB (UI shows this).
- **Vercel limit:** Request body capped at **4.5MB** (files larger return 413). Use images under 4MB.
- **Allowed types:** PDF, DOC, DOCX, TXT, JPG, PNG, GIF.
- If you see 413 instead of 503, the file is too large; resize and try again
---

## Step 7: Retest Upload

1. Open a patient → **Documents** tab.
2. Choose **ID Picture** (or another category).
3. Upload a small image (e.g. < 1MB).
4. If 503 persists, re-run the diagnostic and review Vercel logs again.

---

## Quick Checklist

- [ ] All 5 required env vars set in Vercel for Production
- [ ] Redeployed after changing `NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE`
- [ ] `GET /api/diagnostics/document-upload` returns `ok: true`
- [ ] Bucket exists in `AWS_REGION`
- [ ] IAM user has `s3:ListBucket`, `s3:PutObject`, `s3:GetObject` (and `s3:DeleteObject` if needed)
- [ ] Tried a small image (< 2MB) for ID Picture

---

## Related Docs

- `docs/FIX_DOCUMENTS_500.md` — GET 500 and POST 503 overview
- `docs/AWS_S3_INTEGRATION.md` — AWS S3 setup details
