# Critical Security Patches - Immediate Implementation Required

## Patch 1: Secure Internal API Endpoints

**File:** `src/app/api/internal/patients/route.ts`

```diff
+ import { withAuth } from '@/lib/auth/middleware';
  import { prisma } from "@/lib/db";
  import { NextResponse } from "next/server";

- export async function GET() {
+ export const GET = withAuth(async (req, user) => {
    try {
      const patients = await prisma.patient.findMany({
+       where: {
+         clinicId: user.clinicId // Add clinic isolation
+       },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          patientId: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return NextResponse.json(patients);
    } catch (error) {
      console.error("Failed to fetch patients:", error);
      const mockPatients = [
        { id: 1, firstName: "John", lastName: "Doe", email: "john.doe@example.com", patientId: "000001" },
        { id: 2, firstName: "Jane", lastName: "Smith", email: "jane.smith@example.com", patientId: "000002" },
      ];
      return NextResponse.json(mockPatients);
    }
- }
+ }, { roles: ['admin', 'provider'] });
```

## Patch 2: Move Document Storage Out of Public

**File:** `src/app/api/patients/[id]/documents/route.ts`

```diff
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/db";
  import path from "path";
  import fs from "fs/promises";
+ import { withAuth } from '@/lib/auth/middleware';

- export async function POST(
+ export const POST = withAuth(async (
    request: NextRequest,
-   { params }: { params: Promise<{ id: string }> }
+   user,
+   { params }: { params: Promise<{ id: string }> }
  ) {
    const resolvedParams = await params;
    const patientId = parseInt(resolvedParams.id);
    
+   // Check patient belongs to user's clinic
+   const patient = await prisma.patient.findUnique({
+     where: { id: patientId }
+   });
+   
+   if (!patient || patient.clinicId !== user.clinicId) {
+     return NextResponse.json({ error: "Patient not found" }, { status: 404 });
+   }
    
    // ... existing upload logic ...
    
-   const uploadDir = path.join(process.cwd(), "public", "uploads", "documents");
+   const uploadDir = path.join(process.cwd(), "private", "uploads", "documents");
    await fs.mkdir(uploadDir, { recursive: true });
    
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = path.join(uploadDir, fileName);
    
    // ... save file ...
    
    const document = await prisma.patientDocument.create({
      data: {
        patientId,
        filename: fileName,
        mimeType: file.type,
        category,
        source: "upload",
+       clinicId: user.clinicId,
      },
    });
    
    return NextResponse.json(document);
- }
+ }, { roles: ['admin', 'provider'] });
```

## Patch 3: Add PHI Encryption

**New File:** `src/lib/security/phi-encryption.ts`

```typescript
import crypto from 'crypto';
import { logger } from '@/lib/logger';

const algorithm = 'aes-256-gcm';

// Validate encryption key on startup
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
}

const key = Buffer.from(ENCRYPTION_KEY, 'hex');

export function encryptPHI(text: string | null): string | null {
  if (!text) return null;
  
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    logger.error('Failed to encrypt PHI', error);
    throw new Error('Encryption failed');
  }
}

export function decryptPHI(encryptedData: string | null): string | null {
  if (!encryptedData) return null;
  
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Failed to decrypt PHI', error);
    throw new Error('Decryption failed');
  }
}

// Helper to encrypt patient object
export function encryptPatientPHI(patient: any) {
  return {
    ...patient,
    ssn: encryptPHI(patient.ssn),
    dob: encryptPHI(patient.dob),
    phone: encryptPHI(patient.phone),
    email: encryptPHI(patient.email),
  };
}

// Helper to decrypt patient object  
export function decryptPatientPHI(patient: any) {
  return {
    ...patient,
    ssn: decryptPHI(patient.ssn),
    dob: decryptPHI(patient.dob),
    phone: decryptPHI(patient.phone),
    email: decryptPHI(patient.email),
  };
}
```

## Patch 4: Add Audit Logging Middleware

**New File:** `src/lib/security/audit.ts`

```typescript
import { prisma } from '@/lib/db';
import { NextRequest } from 'next/server';

interface AuditContext {
  userId: number;
  userRole: string;
  clinicId?: number;
  action: string;
  resourceType: string;
  resourceId?: string | number;
  metadata?: any;
}

export async function logAudit(request: NextRequest, context: AuditContext) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: context.userId,
        userRole: context.userRole,
        clinicId: context.clinicId,
        action: context.action,
        resourceType: context.resourceType,
        resourceId: String(context.resourceId || ''),
        ipAddress: request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        requestMethod: request.method,
        requestPath: new URL(request.url).pathname,
        metadata: context.metadata || {},
        timestamp: new Date(),
      }
    });
  } catch (error) {
    // Log audit failure but don't break the request
    console.error('Audit logging failed:', error);
  }
}

// Middleware wrapper with automatic audit logging
export function withAudit(
  handler: Function,
  auditConfig: {
    action: string;
    resourceType: string;
  }
) {
  return async (req: NextRequest, user: any, ...args: any[]) => {
    // Log the access attempt
    await logAudit(req, {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
      action: auditConfig.action,
      resourceType: auditConfig.resourceType,
    });
    
    // Execute the handler
    const response = await handler(req, user, ...args);
    
    // Log successful access with response details
    if (response.status < 400) {
      await logAudit(req, {
        userId: user.id,
        userRole: user.role,
        clinicId: user.clinicId,
        action: `${auditConfig.action}_SUCCESS`,
        resourceType: auditConfig.resourceType,
        metadata: { status: response.status }
      });
    }
    
    return response;
  };
}
```

## Patch 5: Remove Console Logs

**Script:** `scripts/remove-console-logs.sh`

```bash
#!/bin/bash

# Backup first
cp -r src src.backup.$(date +%Y%m%d_%H%M%S)

# Remove console.log, console.error, console.debug statements
find src -type f -name "*.ts" -o -name "*.tsx" | while read file; do
  # Replace console.* with logger.*
  sed -i '' 's/console\.log(/logger.info(/g' "$file"
  sed -i '' 's/console\.error(/logger.error(/g' "$file"
  sed -i '' 's/console\.debug(/logger.debug(/g' "$file"
  sed -i '' 's/console\.warn(/logger.warn(/g' "$file"
  
  # Add logger import if needed
  if grep -q "logger\." "$file" && ! grep -q "import.*logger" "$file"; then
    sed -i '' '1s/^/import { logger } from "@\/lib\/logger";\n/' "$file"
  fi
done

echo "Console logs replaced with logger. Backup saved to src.backup.*"
```

## Patch 6: Session Timeout Implementation

**File:** `src/lib/auth/middleware.ts`

```diff
  import { NextRequest, NextResponse } from 'next/server';
  import { jwtVerify } from 'jose';
  import { JWT_SECRET } from './config';
+ import { logger } from '@/lib/logger';

+ const SESSION_TIMEOUT = 15 * 60 * 1000; // 15 minutes
+ const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  export interface AuthUser {
    id: number;
    email: string;
    role: 'admin' | 'provider' | 'influencer' | 'patient';
+   lastActivity?: number;
+   clinicId?: number;
    [key: string]: any;
  }

  async function verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
-     return payload as unknown as AuthUser;
+     const user = payload as unknown as AuthUser;
+     
+     // Check session timeout
+     if (user.lastActivity) {
+       const timeSinceActivity = Date.now() - user.lastActivity;
+       if (timeSinceActivity > SESSION_TIMEOUT) {
+         logger.security('Session timeout', { userId: user.id });
+         return null;
+       }
+     }
+     
+     return user;
    } catch (error: any) {
-     return null;
+     logger.error('Token verification failed', error);
+     return null;
    }
  }

  export function withAuth(
    handler: (req: NextRequest, user: AuthUser) => Promise<Response>,
    options: {
      roles?: string[];
      optional?: boolean;
+     requireMFA?: boolean;
    } = {}
  ) {
    return async (req: NextRequest) => {
      const token = extractToken(req);

      if (!token) {
        if (options.optional) {
          return handler(req, null as any);
        }
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      const user = await verifyToken(token);

      if (!user) {
        if (options.optional) {
          return handler(req, null as any);
        }
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }
      
+     // Check MFA requirement for sensitive operations
+     if (options.requireMFA && !user.mfaVerified) {
+       return NextResponse.json(
+         { error: 'MFA verification required' },
+         { status: 403 }
+       );
+     }

      // Check role-based access
      if (options.roles && !options.roles.includes(user.role)) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
      
+     // Update last activity
+     user.lastActivity = Date.now();
+     
+     // Refresh token if needed
+     const response = await handler(req, user);
+     
+     const timeUntilExpiry = (user.exp || 0) - Date.now();
+     if (timeUntilExpiry < TOKEN_REFRESH_THRESHOLD) {
+       // Add refresh token to response header
+       response.headers.set('X-Refresh-Token', 'true');
+     }

-     return handler(req, user);
+     return response;
    };
  }
```

## Patch 7: Database Migration for Audit Log

**File:** `prisma/migrations/add_audit_log/migration.sql`

```sql
-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "userRole" TEXT NOT NULL,
    "clinicId" INTEGER,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "requestMethod" TEXT,
    "requestPath" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_clinicId_idx" ON "AuditLog"("clinicId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_resourceType_idx" ON "AuditLog"("resourceType");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE;
```

## Implementation Priority

1. **IMMEDIATE (Day 1):**
   - Patch 1: Secure internal APIs
   - Patch 2: Move document storage
   - Patch 5: Remove console logs

2. **HIGH (Day 2-3):**
   - Patch 3: PHI encryption
   - Patch 4: Audit logging
   - Patch 6: Session timeout

3. **FOLLOW-UP (Week 1):**
   - Patch 7: Database migration
   - Complete testing
   - Security scanning

## Testing After Patches

```bash
# Test authentication is required
curl -X GET http://localhost:3001/api/internal/patients
# Should return 401

# Test with valid token
TOKEN="your-jwt-token"
curl -X GET http://localhost:3001/api/internal/patients \
  -H "Authorization: Bearer $TOKEN"
# Should return filtered patient list

# Test file upload to private storage
curl -X POST http://localhost:3001/api/patients/1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.pdf" \
  -F "category=MEDICAL_RECORD"
# File should be saved in private/uploads/documents/

# Verify encryption
psql -d lifefile_production -c "SELECT ssn, dob FROM patients LIMIT 1;"
# Should show encrypted values like "abc123:def456:encrypted_data"
```

## Rollback Instructions

If any patch causes issues:

```bash
# Restore backup
cp -r src.backup.* src

# Revert migration if applied
npx prisma migrate rollback

# Restart application
npm run build
npm run start
```

## Support

For implementation support:
- Review each patch with security team
- Test in staging environment first
- Monitor logs after deployment
- Report issues immediately

**Remember: Patient safety and data security are paramount. Do not skip any security patches.**
