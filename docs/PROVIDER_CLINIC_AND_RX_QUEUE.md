# Provider–Clinic Assignment and RX Queue (Multi-Clinic)

## Overview

A **single provider** can be assigned to **multiple clinics**. They should:
- See one **unified prescription queue** (invoices, refills, admin-queued orders) for **all** their clinics.
- Be able to **write/approve prescriptions** for any of those clinics from that single queue, with the correct clinic context (Lifefile credentials, PDF branding) per item.

This doc describes how provider–clinic assignment works and how the RX queue and write flows support multi-clinic providers.

---

## 1. Data Model: How Providers Are Added to Clinics

### 1.1 Tables

| Table | Purpose |
|-------|--------|
| **Provider** | One row per provider (NPI, name, DEA, etc.). `clinicId` is legacy single-clinic; nullable for “shared” providers. |
| **ProviderClinic** | Junction: which clinics a provider is assigned to. One row per (providerId, clinicId). Fields: `isPrimary`, `isActive`, optional per-clinic `titleLine`, `deaNumber`, `licenseNumber`, `licenseState`. |
| **User** | Platform user. For provider role: `providerId` → Provider, `clinicId` = primary/default clinic. |
| **UserClinic** | Junction: which clinics a **user** has access to (for login, switcher, admin lists). For provider users, this is typically kept in sync with ProviderClinic when the provider is linked to a user. |

### 1.2 Assignment Flows

**Super-admin: assign provider to a clinic**

- **POST /api/super-admin/providers/[id]/clinics**  
  Body: `{ clinicId, isPrimary?, titleLine?, deaNumber?, licenseNumber?, licenseState? }`  
  Creates/updates a **ProviderClinic** row (via `providerService.assignToClinic` / `providerRepository.assignToClinic`).

**Super-admin: create user for existing provider**

- **POST /api/super-admin/providers/[id]/user**  
  Creates a User with `role: PROVIDER`, links `User.providerId`, sets `User.clinicId` to chosen primary clinic.  
  Creates **UserClinic** for that primary clinic and for **every other clinic** in `provider.providerClinics`, so the provider user can switch context and see all their clinics.

**Super-admin: add existing user (e.g. provider) to another clinic**

- **POST /api/super-admin/clinics/[id]/users**  
  Can add an existing provider user to the clinic: creates **UserClinic** and may set **Provider.clinicId** to `null` (shared) and/or ensure **ProviderClinic** exists for that provider and clinic.

**Clinic admin: add user (incl. provider)**

- **POST /api/admin/clinic/users** (or clinic-scoped user creation)  
  Creates User + optional Provider with **Provider.clinicId = user.clinicId** and **UserClinic** for that clinic. Does not always create **ProviderClinic**; legacy path uses only **Provider.clinicId**.

### 1.3 “All clinics this provider can work at”

For a given **provider user** (User with `providerId` set), the set of clinic IDs they can work at is the **union** of:

1. **User.clinicId** (primary clinic from user record)
2. **UserClinic** – all `clinicId` where `userId = user.id` and `isActive = true`
3. **ProviderClinic** – all `clinicId` where `providerId = user.providerId` and `isActive = true`
4. **Provider.clinicId** – legacy single-clinic (if not null)

Use this set for:
- **Provider prescription queue**: show items (invoices, refills, queued orders) whose `clinicId` is in this set.
- **Approve-and-send / write prescription**: allow the provider to act on an order/invoice if its `clinicId` is in this set; use that **item’s** `clinicId` for Lifefile and branding, not only the user’s current JWT `clinicId`.

---

## 2. Provider Prescription Queue (Single RX Queue for All Clinics)

### 2.1 Intended Behavior

- **GET /api/provider/prescription-queue**  
  Returns a single list of queue items (paid invoices, approved refills, admin-queued orders) for **every clinic** the provider is assigned to.
- Each item includes **clinicId** and **clinic** (name, subdomain, Lifefile flags) so the UI can show which clinic each prescription is for and the write path can use the correct clinic context.

### 2.2 Implementation (multi-clinic)

- Resolve **provider user’s clinic IDs** via the union above (e.g. `getClinicIdsForProviderUser(userId, providerId)`).
- If the set is empty, return 400 “Provider must be associated with at least one clinic”.
- Query:
  - **Invoices**: `clinicId in providerClinicIds`, `status = 'PAID'`, `prescriptionProcessed = false`
  - **Refills**: `clinicId in providerClinicIds`, `status in ['APPROVED','PENDING_PROVIDER']`
  - **Queued orders**: `clinicId in providerClinicIds`, `status = 'queued_for_provider'`
- Merge and sort (e.g. by `queuedAt` / `paidAt`) and return; each item already carries its **clinicId** and **clinic** for the write step.

### 2.3 Mark processed / decline (PATCH/POST)

- Before marking an invoice as processed or declined, verify **invoice.clinicId** is in the provider’s clinic set (same as above). If not, return 403.

---

## 3. Writing Prescriptions for Multiple Clinics (Approve-and-Send)

### 3.1 Intended Behavior

- From the **same** RX queue, the provider can approve and send prescriptions for **any** of their clinics.
- Each prescription must be sent with the **order’s (or invoice’s) clinic** context: that clinic’s Lifefile credentials, PDF branding, and tracking.

### 3.2 Implementation (multi-clinic)

- **POST /api/orders/[id]/approve-and-send**  
  - Load the order; ensure `status === 'queued_for_provider'`.  
  - **Authorization**: allow if the **order’s** `clinicId` is in the provider’s clinic set (not only `user.clinicId === order.clinicId`).  
  - Use **order.clinicId** for `getClinicLifefileClient(order.clinicId)` and for audit (already done in current code for the clinic client; only the access check needed to be generalized).

- **Lifefile / PDF**  
  - Continue to use the **resource’s** clinic (order/invoice) for API and PDF; no change needed once access is correct.

---

## 4. Admin vs Provider Flows

| Flow | Who | Scope |
|------|-----|--------|
| **Admin RX queue** | Admin (clinic or super) | One clinic (or all for super_admin); used for visibility, not for “provider queue”. |
| **Provider RX queue** | Provider | **All** clinics the provider is assigned to (unified queue). |
| **Admin queues prescription** | Admin | Creates order with `status = 'queued_for_provider'`, assigns provider; clinic = patient’s clinic. |
| **Provider approves/sends** | Provider | Allowed if order’s clinic is in provider’s clinic set; send using order’s clinic. |

---

## 5. Checklist for Multi-Clinic Provider Support

- [x] **Provider–clinic assignment**: ProviderClinic + UserClinic (and legacy Provider.clinicId) define “all clinics this provider can work at”.
- [x] **Single RX queue**: GET provider prescription-queue uses **all** provider clinic IDs (not only `user.clinicId`).
- [x] **Write for any clinic**: Approve-and-send (and any “mark processed” / decline) checks that the **resource’s** clinic is in the provider’s clinic set.
- [x] **Clinic context per item**: Each queue item and each order carries `clinicId`/`clinic`; Lifefile and PDF use that clinic for the prescription.

---

## 6. References

- **Provider list (admin)**: `GET /api/providers` (and `?clinicId=` for active clinic) – uses same “user’s clinics” + ProviderClinic for listing; see `providerService.listProviders`.
- **Provider–clinic CRUD**: `GET/POST /api/super-admin/providers/[id]/clinics`, `GET /api/providers/[id]/clinics`.
- **Provider debug**: `GET /api/providers/debug` – shows how clinic IDs are resolved and why a provider appears or not.
- **Repository**: `providerRepository.hasClinicAccess(providerId, clinicId)`, `providerRepository.getProviderClinics(providerId)`.
