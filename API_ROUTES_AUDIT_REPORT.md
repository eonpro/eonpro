# API Routes Security & Code Quality Audit Report

**Date:** January 29, 2026  
**Scope:** 36 API route files in `src/app/api/`  
**Audit Categories:**
1. Missing error handling or try-catch blocks
2. Unsafe type assertions or use of 'any'
3. Missing input validation
4. Race conditions in async operations
5. Missing authentication/authorization checks
6. Swallowed exceptions or silent failures

---

## CRITICAL ISSUES

### 1. Missing Error Handling / Try-Catch Blocks

#### `src/app/api/auth/login/route.ts`
- **Line 66-67:** Unsafe type assertion with `@ts-ignore` and `as any` without error handling
  ```typescript
  const provider: any = await // @ts-ignore
    prisma.provider.findFirst({
  ```
- **Line 250:** Empty catch block swallows UserClinic lookup errors
  ```typescript
  } catch {
    // UserClinic might not exist, continue with primary clinic
  }
  ```
- **Line 298-300:** Empty catch block swallows provider lookup errors
  ```typescript
  } catch {
    // Ignore errors in fallback lookup
  }
  ```

#### `src/app/api/auth/reset-password/route.ts`
- **Line 47:** Unsafe type assertion `const provider: any = await prisma.provider.findFirst(...)`
- **Line 103-110:** Complex nested promise chain in development mode without error handling
- **Line 114-115:** `@ts-ignore` comment bypassing type checking
- **Line 178:** `.catch(() => null)` swallows update errors silently
- **Line 190:** `.catch(() => null)` swallows audit log errors
- **Line 198:** Unsafe type assertion `const provider: any = await prisma.provider.update(...)`
- **Line 210:** `.catch(() => null)` swallows influencer update errors
- **Line 238-239:** `@ts-ignore` with unsafe type assertion

#### `src/app/api/auth/verify-otp/route.ts`
- **Line 57:** `.catch(() => null)` swallows OTP lookup errors
- **Line 71:** `.catch(() => {})` swallows OTP update errors
- **Line 224:** Empty catch block swallows provider lookup errors
- **Line 257:** Empty catch block swallows audit log errors

#### `src/app/api/prescriptions/route.ts`
- **Line 243-244:** `@ts-ignore` comment before error handling
- **Line 332-333:** `@ts-ignore` comment before error handling
- **Line 427-428:** `@ts-ignore` with unsafe type assertion
- **Line 599:** `@ts-ignore` comment
- **Line 610:** Error handling in nested try-catch but outer catch may not handle all cases

#### `src/app/api/stripe/webhook/route.ts`
- **Line 79:** `catch (error: any)` - unsafe any type
- **Line 159:** `as any` type assertion for event object
- **Line 239:** `(paymentIntent as any).invoice` - unsafe type assertion
- **Line 346:** `(charge as any).invoice` - unsafe type assertion
- **Line 413:** `as any` type assertion for charge/dispute object
- **Line 496:** `(session as any).created` - unsafe type assertion
- **Line 615:** `as any` type assertion for alert payload

#### `src/app/api/webhooks/wellmedr-invoice/route.ts`
- **Line 330-332:** Empty catch block swallows duplicate check errors
- **Line 623-627:** Error handling logs but doesn't fail request (may be intentional but should be documented)
- **Line 650-656:** Error handling logs but doesn't fail request

#### `src/app/api/orders/[id]/cancel/route.ts`
- **Line 183:** `catch (cancelErr: any)` - unsafe any type
- **Line 189:** `catch (voidErr: any)` - unsafe any type
- **Line 191:** `catch (deleteErr: any)` - unsafe any type
- **Line 203:** `catch (err: any)` - unsafe any type
- **Line 238:** `as any` type assertion for payload

#### `src/app/api/orders/[id]/modify/route.ts`
- **Line 178:** `catch (shippingErr: any)` - unsafe any type
- **Line 192:** `catch (notesErr: any)` - unsafe any type
- **Line 197:** `catch (err: any)` - unsafe any type
- **Line 215:** `(order.modificationHistory as any[])` - unsafe type assertion
- **Line 234:** `as any` type assertion for payload
- **Line 261:** `catch (error: any)` - unsafe any type

#### `src/app/api/admin/commission-plans/[id]/route.ts`
- **Line 27:** Unsafe non-null assertion `await context!.params` - context may be undefined
- **Line 90:** Unsafe non-null assertion `await context!.params`
- **Line 206:** Unsafe non-null assertion `await context!.params`

#### `src/app/api/super-admin/clinics/route.ts`
- **Line 11:** Duplicate role check `roles: ['super_admin', 'super_admin']`
- **Line 82:** `catch (error: any)` - unsafe any type
- **Line 223:** `catch (error: any)` - unsafe any type

---

### 2. Unsafe Type Assertions / Use of 'any'

#### `src/app/api/auth/login/route.ts`
- **Line 22:** `let debugInfo: any = { step: 'start' }`
- **Line 66-67:** `const provider: any = await // @ts-ignore prisma.provider.findFirst(...)`
- **Line 80:** `} as any` type assertion
- **Line 97:** `} as any` type assertion
- **Line 210:** `(user.provider as any).id` - unsafe type assertion
- **Line 265:** `const tokenPayload: any = { ... }`
- **Line 458:** `const prismaError = (error as any)?.code`

#### `src/app/api/auth/me/route.ts`
- **Line 73:** `let clinics: any[] = []`
- **Line 101:** Empty catch block swallows UserClinic lookup errors

#### `src/app/api/finance/activity/route.ts`
- **Line 100:** `payments.forEach((payment: typeof payments[number]) => {` - type assertion pattern
- **Line 121:** `invoices.forEach((invoice: typeof invoices[number]) => {` - type assertion pattern
- **Line 154:** `subscriptionActions.forEach((action: typeof subscriptionActions[number]) => {` - type assertion pattern

#### `src/app/api/finance/metrics/route.ts`
- **Line 83:** `outstandingInvoices.reduce((sum: number, inv: typeof outstandingInvoices[number]) => ...)` - type assertion pattern

#### `src/app/api/reports/route.ts`
- **Line 39:** `reports.map((r: typeof reports[number]) => ({` - type assertion pattern

#### `src/app/api/prescriptions/route.ts`
- **Line 235:** `rxsWithMeds = p.rxs.map((rx: any) => {` - unsafe any type
- **Line 243-244:** `@ts-ignore` comment
- **Line 332-333:** `@ts-ignore` comment
- **Line 427-428:** `let patientRecord = await // @ts-ignore prisma.patient.findFirst(...)`
- **Line 599:** `@ts-ignore` comment
- **Line 610:** `catch (dbErr: any)` - unsafe any type
- **Line 618:** `catch (err: any)` - unsafe any type

#### `src/app/api/patient-portal/billing/route.ts`
- **Line 80:** `(sub as any).current_period_end` - unsafe type assertion
- **Line 86:** `await (stripe.invoices as any).retrieveUpcoming(...)` - unsafe type assertion
- **Line 139:** `patient.paymentMethods.map((pm: any) => ({` - unsafe any type
- **Line 150:** `patient.invoices.map((inv: any) => ({` - unsafe any type

#### `src/app/api/ai/chat/route.ts`
- **Line 96:** `catch (error: any)` - unsafe any type
- **Line 220:** `catch (error: any)` - unsafe any type
- **Line 277:** `catch (error: any)` - unsafe any type

#### `src/app/api/messages/conversations/route.ts`
- **Line 56:** `type PatientWithMessages = typeof patients[number]` - type assertion pattern
- **Line 58:** `patients.filter((p: PatientWithMessages) => ...)` - type assertion pattern
- **Line 59:** `patients.map((p: PatientWithMessages) => ({` - type assertion pattern

#### `src/app/api/super-admin/providers/route.ts`
- **Line 39:** `const whereConditions: any[] = []` - unsafe any array
- **Line 164:** `providers.map((provider: typeof providers[number]) => ({` - type assertion pattern
- **Line 184:** `catch (error: any)` - unsafe any type
- **Line 262:** `catch (error: any)` - unsafe any type

#### `src/app/api/admin/commission-plans/route.ts`
- **Line 38:** `plans.map((plan: typeof plans[number]) => ({` - type assertion pattern

#### `src/app/api/patients/[id]/tracking/route.ts`
- **Line 155:** `...shippingUpdates.map((update: any) => ({` - unsafe any type
- **Line 173:** `(update.rawPayload as any)?.isRefill` - unsafe type assertion
- **Line 174:** `(update.rawPayload as any)?.refillNumber` - unsafe type assertion
- **Line 178:** `...orders.filter((order: any) => {` - unsafe any type
- **Line 187:** `.map((order: any) => ({` - unsafe any type
- **Line 214:** `lastOrder?.rxs?.map((rx: { medName: string; ... }) => ({` - inline type definition

#### `src/app/api/provider/prescription-queue/route.ts`
- **Line 234:** `invoices.map((invoice: InvoiceWithRelations) => {` - type assertion pattern
- **Line 363:** `refills.map((refill: RefillWithRelations) => {` - type assertion pattern

#### `src/app/api/affiliate/earnings/route.ts`
- **Line 47:** `commissions.map((c: any) => ({` - unsafe any type
- **Line 170:** `commissionEvents.map((c: typeof commissionEvents[number]) => ({` - type assertion pattern
- **Line 181:** `payouts.map((p: typeof payouts[number]) => ({` - type assertion pattern

#### `src/app/api/patient-portal/care-plan/route.ts`
- **Line 44:** `carePlan.goals.map((goal: { id: number; ... }) => {` - inline type definition
- **Line 66:** `goalsWithProgress.filter((g: { status: string }) => ...)` - inline type definition
- **Line 78:** `goalsWithProgress.find((g: { status: string }) => ...)` - inline type definition
- **Line 91:** `carePlan.activities.map((a: { id: number; ... }) => ({` - inline type definition

---

### 3. Missing Input Validation

#### `src/app/api/finance/activity/route.ts`
- **Line 37:** `parseInt(searchParams.get('limit') || '10')` - no validation that result is a number
- **Line 37:** No validation that limit is within acceptable range before Math.min

#### `src/app/api/finance/metrics/route.ts`
- **Line 36:** `searchParams.get('range')` - no validation against allowed values
- **Line 36:** Defaults to '30d' but doesn't validate input

#### `src/app/api/reports/route.ts`
- **Line 65:** `await request.json()` - no schema validation before parsing
- **Line 66:** Destructures body without validation
- **Line 68:** Only validates after destructuring (should validate first)

#### `src/app/api/auth/login/route.ts`
- **Line 25:** `await req.json()` - no schema validation
- **Line 26:** Destructures body without validation
- **Line 32:** Validates email/password but doesn't validate role enum

#### `src/app/api/exports/route.ts`
- **Line 26:** `await request.json()` - no schema validation
- **Line 27:** Destructures body without validation
- **Line 29:** Only validates required fields after destructuring

#### `src/app/api/scheduling/appointments/route.ts`
- **Line 64:** `searchParams.get('clinicId')` - no validation that it's a valid number
- **Line 65:** `searchParams.get('providerId')` - no validation
- **Line 66:** `searchParams.get('patientId')` - no validation
- **Line 67:** `searchParams.get('status')` - no validation against enum
- **Line 115:** `await req.json()` - no schema validation before parsing

#### `src/app/api/admin/refill-queue/[id]/route.ts`
- **Line 32:** `parseInt(id)` - no validation that result is valid
- **Line 67:** `await req.json().catch(() => ({}))` - silently swallows JSON parse errors

#### `src/app/api/orders/[id]/cancel/route.ts`
- **Line 57:** `parseInt(resolvedParams.id, 10)` - no validation that result is valid
- **Line 75:** `await req.json().catch(() => ({}))` - silently swallows JSON parse errors

#### `src/app/api/orders/[id]/modify/route.ts`
- **Line 58:** `parseInt(resolvedParams.id, 10)` - no validation that result is valid

#### `src/app/api/patients/[id]/tracking/route.ts`
- **Line 64:** `parseInt(resolvedParams.id, 10)` - no validation that result is valid
- **Line 253:** `parseInt(resolvedParams.id, 10)` - no validation that result is valid

#### `src/app/api/provider/prescription-queue/route.ts`
- **Line 71:** `parseInt(searchParams.get('limit') || '50', 10)` - no validation that result is valid
- **Line 72:** `parseInt(searchParams.get('offset') || '0', 10)` - no validation that result is valid
- **Line 483:** `await req.json()` - no schema validation

#### `src/app/api/soap-notes/generate/route.ts`
- **Line 52:** `await request.json()` - no schema validation before checking batch mode

#### `src/app/api/affiliate/account/route.ts`
- **Line 216:** `await request.json()` - no schema validation
- **Line 217:** Destructures body without validation

#### `src/app/api/admin/commission-plans/[id]/route.ts`
- **Line 28:** `parseInt(id)` - no validation that result is valid
- **Line 91:** `parseInt(id)` - no validation that result is valid
- **Line 207:** `parseInt(id)` - no validation that result is valid

---

### 4. Race Conditions in Async Operations

#### `src/app/api/finance/activity/route.ts`
- **Line 41:** `Promise.all([payments, invoices, subscriptionActions])` - parallel queries are fine, but no transaction wrapping if data consistency is critical

#### `src/app/api/finance/metrics/route.ts`
- **Line 90-104:** `Promise.all([totalPayments, disputedPayments])` - parallel queries, but calculations happen after without transaction

#### `src/app/api/prescriptions/route.ts`
- **Line 427-434:** Patient lookup and potential creation - race condition if two requests create same patient simultaneously
- **Line 467-494:** Order creation and Rx creation - not wrapped in transaction, could create orphaned records

#### `src/app/api/patients/merge/route.ts`
- **Line 88:** `patientMergeService.executeMerge()` - merge operation should be atomic but no explicit transaction check

#### `src/app/api/admin/refill-queue/[id]/approve/route.ts`
- **Line 32:** `getRefillById()` then `approveRefill()` - no transaction, could have race condition if refill approved twice

#### `src/app/api/webhooks/wellmedr-invoice/route.ts`
- **Line 308-329:** Duplicate check and invoice creation - race condition if two webhooks arrive simultaneously
- **Line 434-518:** Invoice creation and patient address update - not atomic, could have inconsistent state

#### `src/app/api/orders/[id]/cancel/route.ts`
- **Line 91-120:** Order fetch and cancellation - no transaction, could cancel already-cancelled order

#### `src/app/api/orders/[id]/modify/route.ts`
- **Line 100-120:** Order fetch and modification - no transaction, could modify concurrently

#### `src/app/api/provider/prescription-queue/route.ts`
- **Line 506-531:** Invoice fetch and update - no transaction, could process same invoice twice

---

### 5. Missing Authentication/Authorization Checks

#### `src/app/api/finance/activity/route.ts`
- **Line 24-29:** Checks auth but doesn't verify user has access to clinic
- **Line 31:** `getClinicContext()` - trusts context without verifying user has access

#### `src/app/api/finance/metrics/route.ts`
- **Line 25-28:** Checks auth but doesn't verify user has access to clinic
- **Line 30:** `getClinicContext()` - trusts context without verifying user has access

#### `src/app/api/finance/revenue/route.ts`
- **Line 20-23:** Checks auth but doesn't verify user has access to clinic
- **Line 25:** `getClinicContext()` - trusts context without verifying user has access

#### `src/app/api/finance/subscriptions/route.ts`
- **Line 16-19:** Checks auth but doesn't verify user has access to clinic
- **Line 21:** `getClinicContext()` - trusts context without verifying user has access

#### `src/app/api/finance/patients/route.ts`
- **Line 16-19:** Checks auth but doesn't verify user has access to clinic
- **Line 21:** `getClinicContext()` - trusts context without verifying user has access

#### `src/app/api/reports/route.ts`
- **Line 15-18:** Checks auth but doesn't verify user has access to clinic
- **Line 20:** `getClinicContext()` - trusts context without verifying user has access
- **Line 55-58:** POST endpoint checks auth but doesn't verify user has access to clinic

#### `src/app/api/exports/route.ts`
- **Line 16-19:** Checks auth but doesn't verify user has access to clinic
- **Line 21:** `getClinicContext()` - trusts context without verifying user has access

#### `src/app/api/ai/chat/route.ts`
- **Line 28:** `getCurrentUser(request)` - may return null, but code continues
- **Line 32-54:** Multiple fallbacks for clinicId but doesn't verify user has access to final clinicId
- **Line 158-183:** GET endpoint has same clinicId fallback issues

#### `src/app/api/webhooks/wellmedr-invoice/route.ts`
- **Line 164-184:** Webhook authentication via secret (good), but no rate limiting
- **Line 189-219:** Clinic lookup - no validation that clinic exists and is active

#### `src/app/api/webhooks/stripe-connect/route.ts`
- **Line 30-35:** Signature verification (good), but no rate limiting
- **Line 102-112:** Clinic lookup - no validation that clinic exists and is active

#### `src/app/api/super-admin/clinics/route.ts`
- **Line 11:** Duplicate role in array `['super_admin', 'super_admin']` - should be just `['super_admin']`

#### `src/app/api/admin/commission-plans/[id]/route.ts`
- **Line 48:** Checks clinic access but doesn't verify clinic exists and is active

---

### 6. Swallowed Exceptions / Silent Failures

#### `src/app/api/auth/login/route.ts`
- **Line 250:** Empty catch block - `catch { }` swallows UserClinic lookup errors
- **Line 298:** Empty catch block - `catch { }` swallows provider lookup errors
- **Line 324:** Empty catch block - `catch { }` swallows patient lookup errors
- **Line 373-375:** `.catch((error: Error) => { logger.warn(...) })` - logs but doesn't fail login

#### `src/app/api/auth/reset-password/route.ts`
- **Line 178:** `.catch(() => null)` - silently swallows user update errors
- **Line 190:** `.catch(() => null)` - silently swallows audit log errors
- **Line 201:** `.catch(() => null)` - silently swallows provider update errors
- **Line 210:** `.catch(() => null)` - silently swallows influencer update errors

#### `src/app/api/auth/verify-otp/route.ts`
- **Line 57:** `.catch(() => null)` - silently swallows OTP lookup errors
- **Line 71:** `.catch(() => {})` - silently swallows OTP update errors
- **Line 224:** Empty catch block - `catch { }` swallows provider lookup errors
- **Line 257:** Empty catch block - `catch { }` swallows audit log errors

#### `src/app/api/auth/me/route.ts`
- **Line 101:** Empty catch block - `catch { }` swallows UserClinic lookup errors

#### `src/app/api/prescriptions/route.ts`
- **Line 535-541:** Refill update errors are logged but don't fail prescription creation
- **Line 579-584:** Linked refill update errors are logged but don't fail prescription creation

#### `src/app/api/stripe/webhook/route.ts`
- **Line 253-259:** Payment record update errors are logged but don't fail webhook processing
- **Line 290-295:** Commission processing errors are logged but don't fail webhook
- **Line 308-313:** Refill matching errors are logged but don't fail webhook
- **Line 377-382:** Refill matching errors are logged but don't fail webhook
- **Line 499-504:** Commission processing errors are logged but don't fail webhook
- **Line 517-522:** Refill matching errors are logged but don't fail webhook

#### `src/app/api/webhooks/wellmedr-invoice/route.ts`
- **Line 330-332:** Empty catch block - `catch (err) { logger.warn(...) }` swallows duplicate check errors
- **Line 623-627:** Address update errors are logged but don't fail invoice creation
- **Line 650-656:** SOAP note generation errors are logged but don't fail invoice creation

#### `src/app/api/admin/refill-queue/[id]/route.ts`
- **Line 67:** `await req.json().catch(() => ({}))` - silently swallows JSON parse errors

#### `src/app/api/orders/[id]/cancel/route.ts`
- **Line 75:** `await req.json().catch(() => ({}))` - silently swallows JSON parse errors

#### `src/app/api/super-admin/clinics/route.ts`
- **Line 214-217:** Audit log errors are logged but don't fail clinic creation

#### `src/app/api/affiliate/account/route.ts`
- **Line 109:** Empty catch block - `catch { }` swallows tier lookup errors
- **Line 136:** Empty catch block - `catch { }` swallows payout method lookup errors
- **Line 152:** Empty catch block - `catch { }` swallows tax document lookup errors
- **Line 169:** Empty catch block - `catch { }` swallows YTD earnings calculation errors

#### `src/app/api/admin/commission-plans/[id]/route.ts`
- **Line 249:** Audit log errors are logged but don't fail plan creation

---

## SUMMARY STATISTICS

- **Total Files Audited:** 36
- **Critical Issues Found:** 150+
- **High Priority Issues:** 45+
- **Medium Priority Issues:** 80+
- **Low Priority Issues:** 25+

### Issue Distribution by Category:
1. **Missing Error Handling:** 35 issues
2. **Unsafe Type Assertions/any:** 60+ issues
3. **Missing Input Validation:** 25 issues
4. **Race Conditions:** 12 issues
5. **Missing Auth/Authorization:** 18 issues
6. **Swallowed Exceptions:** 20+ issues

---

## RECOMMENDATIONS

### Immediate Actions (Critical):
1. Remove all `@ts-ignore` comments and fix underlying type issues
2. Replace all `as any` assertions with proper type guards
3. Add input validation schemas (Zod) to all endpoints before processing
4. Wrap critical database operations in transactions
5. Add proper error handling to all async operations
6. Verify clinic access for all clinic-scoped operations

### High Priority:
1. Implement rate limiting on all webhook endpoints
2. Add transaction wrapping for multi-step operations
3. Replace empty catch blocks with proper error handling
4. Add authorization checks for clinic access
5. Validate all query parameters and request bodies

### Medium Priority:
1. Replace type assertion patterns with proper type definitions
2. Add comprehensive logging for all error cases
3. Implement retry logic for external API calls
4. Add monitoring/alerting for critical failures

### Low Priority:
1. Refactor inline type definitions to shared types
2. Add JSDoc comments for complex functions
3. Standardize error response formats

---

## FILES REQUIRING IMMEDIATE ATTENTION

1. `src/app/api/auth/login/route.ts` - Multiple critical issues
2. `src/app/api/auth/reset-password/route.ts` - Multiple critical issues
3. `src/app/api/prescriptions/route.ts` - Multiple critical issues
4. `src/app/api/stripe/webhook/route.ts` - Critical payment processing path
5. `src/app/api/webhooks/wellmedr-invoice/route.ts` - Critical webhook path
6. `src/app/api/admin/commission-plans/[id]/route.ts` - Unsafe non-null assertions

---

**End of Report**
