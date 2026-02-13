# Patient Demographics & Customizable Reporting — Comprehensive Plan

**Goal:** Make the reporting aspect of the platform extremely comprehensive and customizable so teams can understand numbers completely.

**Last Updated:** 2026-02-12

---

## Executive Summary

The platform has foundational patient data (state, gender, DOB, source, city, zip, sales rep, provider via orders) and some existing metrics (patientsByGender, patientsBySource, averagePatientAge). What's missing is: **patients by state**, **age demographic buckets**, **male/female ratio**, **customizable report builder** with real data, and a unified **Demographics Report** that surfaces all dimensions. This plan audits the schema, expands the ReportingService, adds new API report types, and proposes a Demographics Dashboard + Report Builder with filters, dimensions, and export.

---

## 1. Patient Data Available (Schema Audit)

### 1.1 Core Demographics on Patient Model

| Field | Type | Use Case | Notes |
|-------|------|----------|-------|
| `state` | String | Geographic: clients per state | Direct |
| `city` | String | Clients per city | Direct |
| `zip` | String | Clients per zip, regional analysis | Direct |
| `gender` | String | Male/female ratio, gender breakdown | May be: M/F, Male/Female, etc. |
| `dob` | String | Age calculation, age demographics | Encrypted; parse for age |
| `source` | String | Acquisition channel | webhook, api, manual, referral, import, stripe |
| `createdAt` | DateTime | New vs established, cohort by signup | Direct |
| `clinicId` | Int | Multi-tenant filter | Required |

### 1.2 Related Demographics (Joins)

| Relation | Field | Use Case |
|----------|-------|----------|
| `PatientSalesRepAssignment` | salesRepId | Patients by sales rep |
| `Order` / `RefillQueue` | providerId, assignedProviderId | Patients by provider |
| `AffiliateReferral` / `attributionAffiliateId` | affiliate | Patients by referrer |
| `RegistrationCode` (via intake) | code | Patients by registration code/campaign |
| `tags` | Json | Custom tags for segmentation |

---

## 2. Current Reporting Capabilities

### 2.1 ReportingService (`getPatientMetrics`)

| Metric | Implemented | Data Source |
|--------|-------------|-------------|
| Total patients | ✅ | Patient.count |
| New patients (in period) | ✅ | Patient.count(createdAt in range) |
| Active patients (90d) | ✅ | Patient with orders/payments/subscriptions |
| Inactive patients | ✅ | Total - Active |
| patientsBySource | ✅ | Patient.groupBy(source) |
| patientsByGender | ✅ | Patient.groupBy(gender) |
| averagePatientAge | ✅ | calculateAge(dob) |
| patientGrowthRate | ✅ | Compare to previous period |
| patientRetentionRate | ✅ | Active/Total |

### 2.2 Patient Reports API (`/api/reports/patients`)

| Type | Implemented | Description |
|------|-------------|-------------|
| `metrics` | ✅ | Full PatientMetrics |
| `new` | ✅ | List new patients in period |
| `active` | ✅ | List active patients |
| `inactive` | ✅ | List inactive patients |
| `by-source` | ✅ | Group by source + sample patients |
| `by-treatment-month` | ✅ | Group by treatment start month |
| **by-state** | ❌ | Not implemented |
| **by-gender** | ❌ | Not implemented (metrics has count, not list) |
| **by-age-bucket** | ❌ | Not implemented |
| **by-sales-rep** | ❌ | Not implemented |
| **by-provider** | ❌ | Not implemented |
| **by-city** | ❌ | Not implemented |
| **by-zip** | ❌ | Not implemented |

### 2.3 Date Range Support

ReportingService supports: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `this_quarter`, `last_quarter`, `this_semester`, `last_semester`, `this_year`, `last_year`, `custom`.

---

## 3. Gap Analysis — Demographics Requirements

### 3.1 Clients per State

**Requirement:** "How many clients per each state"

**Implementation:** `Patient.groupBy({ by: ['state'] })` with `_count`. Return `{ state: string, count: number }[]` sorted by count desc.

**Considerations:** 
- Normalize state (e.g. "CA" vs "California") — store as-is, display with optional mapping
- PHI: Aggregate counts only; no patient-level data for export without audit

### 3.2 Age Demographics

**Requirement:** Age demographic buckets

**Implementation:** 
- Fetch `Patient.dob` for clinic, decrypt where needed
- Compute age via `calculateAge(dob)`
- Bucket: `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+` (configurable)
- Return `{ bucket: string, count: number, percentage: number }[]`

**Considerations:** DOB may be encrypted; use server-side decryption in batches for large clinics.

### 3.3 Male/Female Ratio

**Requirement:** Male/female ratio

**Implementation:** 
- `patientsByGender` already exists; add `maleFemaleRatio`, `genderBreakdown` (count + %)
- Normalize gender values: map "M", "Male", "male" → "Male"; "F", "Female", "female" → "Female"; else "Other/Prefer not to say"

### 3.4 Additional Dimensions

| Dimension | Data Source | Implementation |
|-----------|-------------|----------------|
| By city | Patient.city | groupBy city |
| By zip (or zip prefix) | Patient.zip | groupBy zip or left(zip,3) for region |
| By sales rep | PatientSalesRepAssignment | Join + groupBy salesRepId |
| By provider | Order/RefillQueue | Join patient→orders, groupBy providerId |
| By acquisition source | Patient.source | Already exists |
| By registration code | Intake/code | If tracked |
| By product/treatment | InvoiceItem/Order.primaryMedName | Join patient→orders |

---

## 4. Customizable Reporting Architecture

### 4.1 Report Dimensions (Group-By Options)

Users should be able to build reports by selecting:

- **Primary dimension:** state, city, zip, gender, age_bucket, source, sales_rep, provider
- **Secondary dimension (optional):** e.g. state + gender, or age_bucket + state
- **Date range:** All existing presets + custom
- **Filters:** 
  - Clinic (or all for super_admin)
  - Has payment / has subscription / new in period
  - Date range for "new" (createdAt vs first payment)

### 4.2 Metrics to Display

- Count (patients)
- Percentage of total
- Revenue (sum of payments)
- New in period
- Active (in last 90d)

### 4.3 Report Builder Flow

1. **Select report type:** Demographics, Revenue by Demographics, Custom
2. **Select dimensions:** Primary (required), Secondary (optional)
3. **Select metrics:** Count, %, Revenue, New, Active
4. **Select date range:** Preset or custom
5. **Select filters:** Clinic, source, etc.
6. **Run** → API returns aggregated data
7. **Visualize:** Chart (bar, pie, table) + Export CSV

### 4.4 Demographics Dashboard (Pre-Built)

A single page showing:

- **Summary cards:** Total patients, new this month, active, avg age
- **Geographic:** Map or bar chart — patients by state (top 10 + others)
- **Age:** Bar chart — age buckets (18-24, 25-34, …)
- **Gender:** Pie chart — Male / Female / Other with ratio
- **Source:** Pie/bar — webhook, manual, referral, stripe, etc.
- **Sales rep:** Bar — patients per sales rep
- **Provider:** Bar — patients per provider (from orders)
- Each section **clickable** → drill-down to patient list (paginated, exportable)

---

## 5. API Design

### 5.1 New Endpoints

#### `GET /api/reports/patients/demographics`

Query params:
- `range`, `startDate`, `endDate` (date range)
- `dimensions`: comma-separated, e.g. `state,gender` or `age_bucket`
- `metrics`: `count,revenue,new,active` (default: count)
- `clinicId`: optional override

Response:
```json
{
  "summary": { "totalPatients": 1234, "averageAge": 42, "maleFemaleRatio": 0.65 },
  "byDimension": {
    "state": [
      { "value": "CA", "count": 450, "percentage": 36.5 },
      { "value": "TX", "count": 230, "percentage": 18.6 }
    ],
    "age_bucket": [
      { "bucket": "25-34", "count": 320, "percentage": 25.9 },
      { "bucket": "35-44", "count": 280, "percentage": 22.7 }
    ],
    "gender": [
      { "value": "Female", "count": 650, "percentage": 52.7 },
      { "value": "Male", "count": 580, "percentage": 47.0 }
    ]
  },
  "dateRange": { "start": "...", "end": "..." }
}
```

#### `GET /api/reports/patients/drill-down`

Query params:
- `dimension`: state | gender | age_bucket | city | sales_rep | provider
- `value`: e.g. "CA", "Female", "25-34"
- `range`, `startDate`, `endDate`
- `limit`, `offset` (pagination)
- `export`: "csv" for CSV response

Response: List of patients (id, displayId, name, age, state, gender, source, createdAt) — PHI decrypted, paginated. For export=csv, return CSV file.

### 5.2 Extend ReportingService

```typescript
// New methods
getPatientsByState(clinicId, dateRange): Promise<{ state: string; count: number }[]>
getPatientsByAgeBucket(clinicId, dateRange, buckets?): Promise<{ bucket: string; count: number }[]>
getPatientsByCity(clinicId, dateRange): Promise<{ city: string; state: string; count: number }[]>
getPatientsBySalesRep(clinicId, dateRange): Promise<{ salesRepId: number; salesRepName: string; count: number }[]>
getPatientsByProvider(clinicId, dateRange): Promise<{ providerId: number; providerName: string; count: number }[]>
getDemographicsSummary(clinicId, dateRange): Promise<DemographicsSummary>
getCustomDemographicsReport(clinicId, params: { dimensions: string[]; metrics: string[]; dateRange }): Promise<CustomReportResult>
```

---

## 6. UI Components

### 6.1 Demographics Report Page

- **Route:** `/admin/reports/demographics` or `/admin/finance/reports/demographics`
- **Sections:**
  - Filters: Date range, clinic (if multi-clinic)
  - Summary: Total, new, active, avg age, M/F ratio
  - Charts: State (bar), Age (bar), Gender (pie), Source (pie), Sales Rep (bar), Provider (bar)
- **Interactions:** Click bar/slice → open drill-down modal with patient list + Export CSV

### 6.2 Report Builder Enhancements

- **Current:** Report builder has METRICS (revenue, patients, subscriptions, payments) but uses mock data
- **Enhancement:** 
  - Wire to real API (`/api/reports/builder` or similar)
  - Add DEMOGRAPHICS metrics: by state, by age, by gender, by source, by sales rep
  - Add dimension selector: group by state, gender, age_bucket, etc.
  - Add export

### 6.3 Finance Hub Integration

- Add "Demographics" under Reports in Finance Hub
- Or add "Patient Demographics" tab to existing Reports page

---

## 7. HIPAA & PHI Considerations

- **Aggregates:** Counts, percentages, and sums by dimension are generally safe (no individual PHI)
- **Drill-down:** Returning patient lists is PHI — ensure:
  - Role-based access (admin, staff, provider with clinic scope)
  - Audit log for "report exported" or "demographic report viewed"
  - CSV export logged
- **Small cell suppression:** For buckets with very few patients (e.g. 1–4), consider masking ("<5") to reduce re-identification risk (optional)

---

## 8. Implementation Phases

### Phase 1: Core Demographics API (1–2 days)
- [ ] Add `getPatientsByState` to ReportingService
- [ ] Add `getPatientsByAgeBucket` (configurable buckets)
- [ ] Add `getDemographicsSummary` (total, avg age, M/F ratio)
- [ ] Add `by-state`, `by-age-bucket`, `by-gender` to `/api/reports/patients`
- [ ] Normalize gender for ratio calculation

### Phase 2: Demographics Dashboard Page (1–2 days)
- [ ] Create `/admin/reports/demographics` page
- [ ] Summary cards + charts (state, age, gender, source)
- [ ] Wire to new API
- [ ] Add to Reports nav / Finance Hub

### Phase 3: Sales Rep & Provider Dimensions (1 day)
- [ ] `getPatientsBySalesRep` (join PatientSalesRepAssignment)
- [ ] `getPatientsByProvider` (join Order/RefillQueue)
- [ ] Add to API and dashboard

### Phase 4: Drill-Down & Export (1 day)
- [ ] `GET /api/reports/patients/drill-down` with filters
- [ ] Drill-down modal on dashboard
- [ ] CSV export for drill-down results
- [ ] Audit logging for export

### Phase 5: Custom Report Builder (2–3 days)
- [ ] Unified `GET /api/reports/custom` with dimensions + metrics
- [ ] Report Builder: wire to real API, add demographics dimensions
- [ ] Save/load report configurations (optional)
- [ ] Scheduled report delivery (optional)

### Phase 6: City, Zip, Affiliate Dimensions (optional)
- [ ] By city, by zip (or region)
- [ ] By affiliate/referral source
- [ ] By registration code

---

## 9. Related Files

| File | Purpose |
|------|---------|
| `src/services/reporting/ReportingService.ts` | Core reporting logic |
| `src/app/api/reports/patients/route.ts` | Patient reports API |
| `src/app/admin/patients/reports/page.tsx` | Patient reports UI (basic) |
| `src/app/admin/finance/reports/builder/page.tsx` | Report builder (mock data) |
| `prisma/schema.prisma` | Patient, PatientSalesRepAssignment, Order |
| `src/lib/security/phi-encryption.ts` | DOB decryption for age |

---

## 10. Verification Checklist

- [ ] Patients by state returns real counts
- [ ] Age buckets use decrypted DOB where needed
- [ ] Male/female ratio handles M/F/Male/Female/Other
- [ ] Sales rep breakdown shows correct assignments
- [ ] Provider breakdown reflects order attribution
- [ ] Drill-down returns correct filtered patient list
- [ ] Export CSV includes only authorized fields
- [ ] Date range applies correctly to new vs established
- [ ] Multi-clinic: clinic filter enforced
- [ ] Super admin can run across clinics (if designed)
