# 🏥 Multi-Clinic Implementation Using EONPRO Architecture Patterns

## Executive Summary
Based on EONPRO INDIA EHR's enterprise architecture, we can rapidly implement multi-clinic capabilities by leveraging their proven patterns. EONPRO uses a **hybrid multi-tenancy approach** combining shared infrastructure with logical data isolation.

## 🎯 EONPRO's Multi-Clinic Architecture (Extracted Patterns)

### Core Architecture Components
```
┌─────────────────────────────────────────────────────────┐
│                    API Gateway Layer                      │
│            (Spring Cloud Gateway / Next.js API)           │
├─────────────────────────────────────────────────────────┤
│                  Clinic Resolution Layer                  │
│          (Subdomain/Header/JWT-based routing)            │
├─────────────────────────────────────────────────────────┤
│                   Service Layer                          │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│    │Patient   │ │Provider  │ │Billing   │ │Telehealth││
│    │Service   │ │Service   │ │Service   │ │Service   ││
│    └──────────┘ └──────────┘ └──────────┘ └──────────┘│
├─────────────────────────────────────────────────────────┤
│                  Data Isolation Layer                     │
│    ┌──────────────────────────────────────────────┐     │
│    │  Row-Level Security with Clinic Context      │     │
│    └──────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────┤
│                    Database Layer                         │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│    │Clinic 1  │ │Clinic 2  │ │Shared    │             │
│    │Schema    │ │Schema    │ │Tables    │             │
│    └──────────┘ └──────────┘ └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Quick Implementation Path (2-3 Weeks)

### Phase 1: Database Schema Updates (Week 1)

#### Step 1: Add Clinic Model
```prisma
// prisma/schema.prisma

model Clinic {
  id                Int                @id @default(autoincrement())
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  
  // Basic Information
  name              String
  subdomain         String             @unique
  customDomain      String?            @unique
  status            ClinicStatus       @default(ACTIVE)
  
  // Configuration
  settings          Json               // UI settings, themes, etc.
  features          Json               // Enabled features per clinic
  integrations      Json               // API keys, webhooks per clinic
  
  // Billing & Limits
  billingPlan       String             @default("starter")
  patientLimit      Int                @default(100)
  providerLimit     Int                @default(5)
  storageLimit      Int                @default(5000) // MB
  
  // Contact Information
  adminEmail        String
  supportEmail      String?
  phone             String?
  address           Json?
  
  // Branding
  logoUrl           String?
  primaryColor      String             @default("#3B82F6")
  secondaryColor    String             @default("#10B981")
  
  // Database Configuration (for future database-per-clinic)
  databaseUrl       String?            // Optional: for dedicated databases
  schemaName        String?            // Optional: for schema-per-clinic
  
  // Relations
  users             User[]
  providers         Provider[]
  patients          Patient[]
  orders            Order[]
  tickets           Ticket[]
  intakeTemplates   IntakeFormTemplate[]
  appointments      Appointment[]
  invoices          Invoice[]
  subscriptions     Subscription[]
  auditLogs         ClinicAuditLog[]
  
  @@index([subdomain])
  @@index([status])
}

enum ClinicStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
  TRIAL
  EXPIRED
}

model ClinicAuditLog {
  id                Int                @id @default(autoincrement())
  createdAt         DateTime           @default(now())
  clinicId          Int
  clinic            Clinic             @relation(fields: [clinicId], references: [id])
  action            String
  userId            Int?
  user              User?              @relation(fields: [userId], references: [id])
  details           Json?
  ipAddress         String?
  
  @@index([clinicId, createdAt])
}
```

#### Step 2: Update All Models with clinicId
```prisma
// Update existing models
model Patient {
  id               Int               @id @default(autoincrement())
  clinicId         Int               // NEW
  clinic           Clinic            @relation(fields: [clinicId], references: [id]) // NEW
  // ... existing fields
  
  @@index([clinicId]) // NEW - for performance
  @@unique([clinicId, patientId]) // Ensure patient IDs are unique per clinic
}

model Provider {
  id               Int               @id @default(autoincrement())
  clinicId         Int               // NEW
  clinic           Clinic            @relation(fields: [clinicId], references: [id]) // NEW
  // ... existing fields
  
  @@index([clinicId])
  @@unique([clinicId, npi]) // NPI unique per clinic
}

model User {
  id               Int               @id @default(autoincrement())
  clinicId         Int?              // NEW - nullable for super admins
  clinic           Clinic?           @relation(fields: [clinicId], references: [id])
  // ... existing fields
  
  @@index([clinicId])
  @@unique([clinicId, email]) // Email unique per clinic
}

// Repeat for all other models...
```

### Phase 2: Middleware & Context (Week 1-2)

#### Step 3: Clinic Resolution Middleware
```typescript
// src/middleware/clinic.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function clinicMiddleware(request: NextRequest) {
  // 1. Extract clinic identifier
  const clinicId = await resolveClinic(request);
  
  if (!clinicId && !isPublicRoute(request.pathname)) {
    return NextResponse.redirect(new URL('/clinic-select', request.url));
  }
  
  // 2. Attach to headers for API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-clinic-id', clinicId?.toString() || '');
  
  // 3. Continue with modified headers
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

async function resolveClinic(request: NextRequest): Promise<number | null> {
  // Priority 1: Subdomain
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];
  
  if (subdomain && subdomain !== 'www' && subdomain !== 'app') {
    const clinic = await prisma.clinic.findUnique({
      where: { subdomain },
      select: { id: true, status: true }
    });
    
    if (clinic?.status === 'ACTIVE') {
      return clinic.id;
    }
  }
  
  // Priority 2: Custom domain
  const clinic = await prisma.clinic.findFirst({
    where: { 
      customDomain: hostname,
      status: 'ACTIVE'
    },
    select: { id: true }
  });
  
  if (clinic) {
    return clinic.id;
  }
  
  // Priority 3: Session/Cookie (for clinic switching)
  const clinicCookie = request.cookies.get('selected-clinic');
  if (clinicCookie) {
    return parseInt(clinicCookie.value);
  }
  
  // Priority 4: JWT claim (for API access)
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (token) {
    const decoded = await verifyToken(token);
    if (decoded?.clinicId) {
      return decoded.clinicId;
    }
  }
  
  return null;
}
```

#### Step 4: Clinic Context Provider
```typescript
// src/lib/clinic/context.tsx

import { createContext, useContext, useEffect, useState } from 'react';
import { Clinic } from '@prisma/client';

interface ClinicContextValue {
  clinic: Clinic | null;
  switchClinic: (clinicId: number) => Promise<void>;
  isLoading: boolean;
}

const ClinicContext = createContext<ClinicContextValue | null>(null);

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    fetchCurrentClinic();
  }, []);
  
  const fetchCurrentClinic = async () => {
    try {
      const response = await fetch('/api/clinic/current');
      if (response.ok) {
        const data = await response.json();
        setClinic(data);
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const switchClinic = async (clinicId: number) => {
    await fetch('/api/clinic/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicId }),
    });
    await fetchCurrentClinic();
  };
  
  return (
    <ClinicContext.Provider value={{ clinic, switchClinic, isLoading }}>
      {children}
    </ClinicContext.Provider>
  );
}

export const useClinic = () => {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within ClinicProvider');
  }
  return context;
};
```

#### Step 5: Prisma Extension for Automatic Filtering
```typescript
// src/lib/db/clinic-extension.ts

import { Prisma } from '@prisma/client';
import { getClinicId } from '@/lib/clinic/session';

export const clinicExtension = Prisma.defineExtension({
  name: 'clinicFilter',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const clinicId = await getClinicId();
        
        // Skip for models that don't have clinicId
        const modelsWithoutClinic = ['SystemSettings', 'ClinicAuditLog'];
        if (modelsWithoutClinic.includes(model) || !clinicId) {
          return query(args);
        }
        
        // Add clinic filter to queries
        if (['findMany', 'findFirst', 'findUnique', 'count'].includes(operation)) {
          args.where = {
            ...args.where,
            clinicId,
          };
        }
        
        // Add clinic to creates
        if (operation === 'create') {
          args.data = {
            ...args.data,
            clinicId,
          };
        }
        
        // Add clinic to updates
        if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
          args.where = {
            ...args.where,
            clinicId,
          };
        }
        
        return query(args);
      },
    },
  },
});

// Export extended client
export const prismaWithClinic = prisma.$extends(clinicExtension);
```

### Phase 3: UI & Admin Tools (Week 2)

#### Step 6: Clinic Switcher Component
```typescript
// src/components/clinic/ClinicSwitcher.tsx

import { useState } from 'react';
import { useClinic } from '@/lib/clinic/context';

export function ClinicSwitcher() {
  const { clinic, switchClinic } = useClinic();
  const [isOpen, setIsOpen] = useState(false);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  
  const loadClinics = async () => {
    const response = await fetch('/api/clinics/my-clinics');
    const data = await response.json();
    setClinics(data);
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadClinics();
        }}
        className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow"
      >
        <img 
          src={clinic?.logoUrl || '/default-clinic-logo.png'} 
          alt={clinic?.name}
          className="w-8 h-8 rounded"
        />
        <div className="text-left">
          <p className="text-sm font-semibold">{clinic?.name}</p>
          <p className="text-xs text-gray-500">{clinic?.subdomain}.eonpro.com</p>
        </div>
      </button>
      
      {isOpen && (
        <div className="absolute top-full mt-2 w-64 bg-white rounded-lg shadow-lg">
          {clinics.map(c => (
            <button
              key={c.id}
              onClick={() => {
                switchClinic(c.id);
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3"
            >
              <img src={c.logoUrl} alt={c.name} className="w-10 h-10 rounded" />
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-gray-500">{c.patientCount} patients</p>
              </div>
              {c.id === clinic?.id && (
                <span className="ml-auto text-green-500">✓</span>
              )}
            </button>
          ))}
          
          <button
            className="w-full text-left px-4 py-3 border-t hover:bg-gray-50 text-blue-600"
            onClick={() => window.location.href = '/admin/clinics/new'}
          >
            + Add New Clinic
          </button>
        </div>
      )}
    </div>
  );
}
```

#### Step 7: Clinic Admin Dashboard
```typescript
// src/app/admin/clinics/page.tsx

export default function ClinicsAdminPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Clinic Management</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ClinicCard />
        <AddClinicCard />
      </div>
      
      <ClinicTable />
      <ClinicSettings />
      <ClinicBilling />
    </div>
  );
}
```

## 🏗️ Migration Strategy (From Single to Multi-Clinic)

### Step 1: Create Default Clinic
```sql
-- Migration: 001_add_default_clinic.sql

-- 1. Create default clinic for existing data
INSERT INTO "Clinic" (
  name,
  subdomain,
  status,
  "adminEmail",
  "billingPlan",
  settings,
  features,
  "createdAt",
  "updatedAt"
) VALUES (
  'Main Clinic',
  'main',
  'ACTIVE',
  'admin@example.com',
  'enterprise',
  '{}',
  '{}',
  NOW(),
  NOW()
);

-- 2. Add clinicId to all tables (nullable initially)
ALTER TABLE "Patient" ADD COLUMN "clinicId" INTEGER;
ALTER TABLE "Provider" ADD COLUMN "clinicId" INTEGER;
ALTER TABLE "User" ADD COLUMN "clinicId" INTEGER;
-- ... repeat for all tables

-- 3. Set default clinic for all existing data
UPDATE "Patient" SET "clinicId" = 1;
UPDATE "Provider" SET "clinicId" = 1;
UPDATE "User" SET "clinicId" = 1;
-- ... repeat for all tables

-- 4. Make clinicId required
ALTER TABLE "Patient" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Provider" ALTER COLUMN "clinicId" SET NOT NULL;
-- ... repeat for all tables

-- 5. Add foreign key constraints
ALTER TABLE "Patient" 
  ADD CONSTRAINT "Patient_clinicId_fkey" 
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"(id);
-- ... repeat for all tables

-- 6. Add indexes for performance
CREATE INDEX "Patient_clinicId_idx" ON "Patient"("clinicId");
CREATE INDEX "Provider_clinicId_idx" ON "Provider"("clinicId");
-- ... repeat for all tables
```

## 🚀 Advanced Features (Future Phases)

### Database-per-Clinic (Optional - Phase 4)
```typescript
// src/lib/db/multi-tenant.ts

class MultiTenantDatabaseManager {
  private connections = new Map<number, PrismaClient>();
  
  async getClient(clinicId: number): Promise<PrismaClient> {
    if (!this.connections.has(clinicId)) {
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { databaseUrl: true, schemaName: true }
      });
      
      if (clinic?.databaseUrl) {
        // Dedicated database
        const client = new PrismaClient({
          datasources: {
            db: { url: clinic.databaseUrl }
          }
        });
        this.connections.set(clinicId, client);
      } else if (clinic?.schemaName) {
        // Schema-per-tenant (PostgreSQL only)
        const client = new PrismaClient({
          datasources: {
            db: { 
              url: `${process.env.DATABASE_URL}?schema=${clinic.schemaName}`
            }
          }
        });
        this.connections.set(clinicId, client);
      } else {
        // Fallback to shared database with row-level security
        return prismaWithClinic;
      }
    }
    
    return this.connections.get(clinicId)!;
  }
}
```

### Clinic-Specific Features & Limits
```typescript
// src/lib/clinic/features.ts

export async function checkClinicFeature(
  clinicId: number, 
  feature: string
): Promise<boolean> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { features: true, billingPlan: true }
  });
  
  const features = clinic?.features as Record<string, boolean>;
  const planFeatures = PLAN_FEATURES[clinic?.billingPlan || 'starter'];
  
  return features[feature] || planFeatures.includes(feature);
}

export async function checkClinicLimit(
  clinicId: number,
  resource: 'patients' | 'providers' | 'storage'
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    include: {
      _count: {
        select: { patients: true, providers: true }
      }
    }
  });
  
  // Check limits based on resource type
  // Return whether action is allowed
}
```

## 📊 Performance Optimizations

### 1. Indexed Queries
```sql
-- Critical indexes for multi-tenant queries
CREATE INDEX CONCURRENTLY idx_patients_clinic_created 
  ON patients(clinic_id, created_at DESC);
  
CREATE INDEX CONCURRENTLY idx_orders_clinic_status 
  ON orders(clinic_id, status);
```

### 2. Cached Clinic Context
```typescript
// Use Redis for clinic configuration caching
const clinicConfig = await redis.get(`clinic:${clinicId}:config`);
if (!clinicConfig) {
  const config = await prisma.clinic.findUnique({ where: { id: clinicId }});
  await redis.set(`clinic:${clinicId}:config`, config, 'EX', 3600);
}
```

## 🔒 Security Considerations

### 1. Data Isolation Verification
```typescript
// src/lib/security/clinic-isolation.ts

export function verifyClinicIsolation(
  requestClinicId: number,
  resourceClinicId: number
): void {
  if (requestClinicId !== resourceClinicId) {
    throw new Error('Cross-clinic access violation');
  }
}
```

### 2. Audit All Cross-Clinic Operations
```typescript
await prisma.clinicAuditLog.create({
  data: {
    clinicId,
    action: 'CROSS_CLINIC_ACCESS_ATTEMPT',
    userId: user.id,
    details: { attempted: targetClinicId },
    ipAddress: request.ip
  }
});
```

## 📈 Rollout Strategy

### Week 1: Foundation
- [ ] Add Clinic model to schema
- [ ] Update all models with clinicId
- [ ] Create migration scripts
- [ ] Test with default clinic

### Week 2: Middleware & Context
- [ ] Implement clinic resolution middleware
- [ ] Add clinic context provider
- [ ] Update all API routes
- [ ] Test data isolation

### Week 3: UI & Testing
- [ ] Build clinic switcher
- [ ] Create admin dashboard
- [ ] Implement onboarding flow
- [ ] End-to-end testing

### Week 4: Production
- [ ] Deploy to staging
- [ ] Security audit
- [ ] Performance testing
- [ ] Production deployment

## 💰 Cost-Benefit Analysis

| Approach | Development Cost | Infrastructure Cost | Maintenance | Compliance |
|----------|-----------------|-------------------|-------------|------------|
| **Row-Level (Current Plan)** | $5-10k | $100/month | Low | Good |
| **Schema-per-Tenant** | $15-20k | $200/month | Medium | Better |
| **Database-per-Tenant** | $25-30k | $500+/month | High | Best |

## 🎯 Immediate Next Steps

1. **Today**: Create feature branch `feature/multi-clinic`
2. **Tomorrow**: Add Clinic model to schema
3. **This Week**: Implement basic clinic context
4. **Next Week**: Build UI components
5. **Testing**: 1 week comprehensive testing
6. **Launch**: Gradual rollout with feature flags

---

*Based on EONPRO INDIA EHR patterns and best practices*
*Estimated Timeline: 2-3 weeks for basic multi-clinic support*
*Full Implementation: 4-6 weeks with all features*
