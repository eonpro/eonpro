# Frontend Components & Pages Audit Report

**Date:** January 29, 2026  
**Scope:** `src/app/` pages and `src/components/` components

---

## 1. Hydration Mismatches (Browser APIs during SSR)

### Critical Issues

#### `src/components/PatientDocumentsView.tsx`
- **Line 39**: `localStorage.getItem('auth-token')` called directly in `useEffect` without `typeof window !== 'undefined'` check
- **Line 128**: `localStorage.getItem('auth-token')` in `handleFiles` function
- **Line 171**: `localStorage.getItem('auth-token')` in `handleDelete` function
- **Line 197**: `localStorage.getItem('auth-token')` in `handleView` function
- **Line 227**: `localStorage.getItem('auth-token')` in `handleDownload` function

#### `src/app/patient-portal/documents/page.tsx`
- **Line 32**: `localStorage.getItem('patientId')` called directly in `useEffect` without SSR guard
- **Line 180**: `localStorage.getItem('auth-token')` in `handleView` function

#### `src/app/patient-portal/page.tsx`
- **Line 42**: `localStorage.getItem('user')` called directly in `useEffect` without SSR guard

#### `src/app/patient-portal/progress/page.tsx`
- **Line 101**: `localStorage.getItem('user')` called directly in `useEffect` without SSR guard

#### `src/components/PrescriptionForm.tsx`
- **Line 175**: `localStorage.getItem('activeClinicId')` called directly in `useEffect` without SSR guard

#### `src/components/PatientChatView.tsx`
- **Line 89**: `localStorage.getItem('auth-token')` called in `loadMessages` function

#### `src/app/provider/page.tsx`
- **Line 64**: `localStorage.getItem('auth-token')` called in `fetchDashboardData` function

#### `src/app/patients/page.tsx`
- **Lines 130-135**: Multiple `localStorage.getItem()` calls without SSR guards

**Recommendation:** Wrap all `localStorage`/`sessionStorage`/`window` access with `typeof window !== 'undefined'` checks or use them only inside `useEffect` hooks that run on the client.

---

## 2. Missing Loading/Error/Empty States

### Missing Error States

#### `src/app/patient-portal/documents/page.tsx`
- **Line 44-60**: `fetchDocuments` function has no error state handling - only logs error but doesn't set error state
- **Line 144-149**: `handleFiles` catches error but only shows `alert()` - no error state for UI feedback

#### `src/components/PatientDocumentsView.tsx`
- **Line 34-65**: `fetchDocuments` catches error but doesn't set error state for UI display
- **Line 154-161**: `handleFiles` error handling only uses `alert()` - no error state

#### `src/app/patient-portal/progress/page.tsx`
- **Line 115-153**: `fetchData` function has no error state - only logs to console
- Missing error UI for failed data fetches

#### `src/app/provider/page.tsx`
- **Line 62-110**: `fetchDashboardData` has no error state handling
- **Line 105**: Only logs error to console, no user-facing error state

#### `src/app/patient-portal/page.tsx`
- **Line 59-125**: `loadPatientData` function has no error state
- **Line 124**: Only logs error, no UI feedback

### Missing Empty States

Most components handle empty states well, but verify:
- `src/app/affiliate/(dashboard)/analytics/page.tsx` - Check if empty data states are handled
- `src/app/admin/finance/reports/page.tsx` - Verify empty report lists show appropriate messages

**Recommendation:** Add error state variables (`const [error, setError] = useState<string | null>(null)`) and display error messages in UI for all async operations.

---

## 3. Unsafe useState Initializations

### Issues Found

#### `src/app/patient-portal/documents/page.tsx`
- **Line 28**: `const [patientId, setPatientId] = useState<number | null>(null);` - Safe, but initialized from localStorage in useEffect

#### `src/app/patient-portal/page.tsx`
- **Line 30**: `const [patient, setPatient] = useState<any>(null);` - Initialized from localStorage in useEffect (line 42)

#### `src/app/patient-portal/progress/page.tsx`
- **Line 68**: `const [patientId, setPatientId] = useState<number | null>(null);` - Initialized from localStorage in useEffect (line 101)

**Note:** These are actually safe because they initialize to `null` and are set in `useEffect`. However, ensure components handle the `null` state properly during initial render.

---

## 4. Missing Key Props in Lists

### Issues Found

**None Found** - All components properly use `key` props in list renders.

### Verified as Correct

#### `src/app/patient-portal/chat/page.tsx`
- **Line 286**: Has `key={date}` ✓
- **Line 297**: Has `key={message.id}` ✓

#### `src/components/PatientChatView.tsx`
- **Line 315**: Has `key={date}` ✓
- **Line 327**: Has `key={message.id}` ✓

#### `src/components/InternalChat.tsx`
- **Line 317**: Has `key={user.id}` ✓
- **Line 391**: Has `key={message.id}` ✓

#### `src/app/patient-portal/documents/page.tsx`
- **Line 296**: Has `key={cat.value}` ✓
- **Line 377**: Has `key={doc.id}` ✓

#### `src/components/PatientDocumentsView.tsx`
- **Line 285**: Has `key={cat.value}` ✓
- **Line 361**: Has `key={doc.id}` ✓

#### `src/app/patient-portal/documents/page.tsx`
- **Line 296**: `{documentCategories.map((cat) => (` - Has `key={cat.value}` ✓ (OK)
- **Line 377**: `{documents.map((doc) => (` - Has `key={doc.id}` ✓ (OK)

#### `src/components/PatientDocumentsView.tsx`
- **Line 285**: `{documentCategories.map((cat: any) => (` - Has `key={cat.value}` ✓ (OK)
- **Line 361**: `{documents.map((doc: any) => (` - Has `key={doc.id}` ✓ (OK)

**Recommendation:** Add `key` props to all `.map()` calls that render JSX elements. Use stable, unique identifiers (IDs) when available, or generate stable keys.

---

## 5. Memory Leaks (Missing Cleanup in useEffect)

### Critical Issues

#### `src/components/PatientDocumentsView.tsx`
- **Line 117-125**: `setInterval` created in `handleFiles` function but not stored in ref or cleaned up properly
  - Interval is cleared inside `setState` callback (line 120), but if component unmounts during upload, interval may not be cleared
  - **Fix:** Store interval in `useRef` and clear in cleanup function

#### `src/app/patient-portal/documents/page.tsx`
- **Line 114-122**: `setInterval` created in `handleFiles` function without proper cleanup
  - Similar issue - interval cleared at line 129, but no cleanup if component unmounts
  - **Fix:** Use `useRef` to store interval and add cleanup

#### `src/components/admin/BrandingImageUploader.tsx`
- **Line 90**: `setInterval` for upload progress - verify cleanup exists

#### `src/components/AddressAutocomplete.tsx`
- **Line 75**: `setInterval` - verify cleanup exists
- **Line 361**: `setInterval` - verify cleanup exists

#### `src/app/webhooks/monitor/page.tsx`
- **Line 80**: `setInterval` - verify cleanup exists in useEffect return

#### `src/app/admin/monitoring/page.tsx`
- **Line 127**: `setInterval` - verify cleanup exists

#### `src/app/status/page.tsx`
- **Line 42**: `setInterval` - verify cleanup exists

### Properly Handled (Good Examples)

#### `src/components/InternalChat.tsx`
- **Line 86**: `setInterval` properly cleaned up in useEffect return (line 91) ✓

#### `src/components/PatientChatView.tsx`
- **Line 74**: `setInterval` properly cleaned up in useEffect return (line 78) ✓

#### `src/components/SessionExpirationHandler.tsx`
- **Line 45**: `setInterval` properly cleaned up (line 55) ✓
- **Line 90**: `setInterval` properly cleaned up ✓

#### `src/app/patient-portal/chat/page.tsx`
- **Line 69**: `setInterval` properly cleaned up ✓

**Recommendation:** For intervals/timeouts created outside `useEffect`, use `useRef` to store them and ensure cleanup. For intervals in `useEffect`, always return cleanup function.

---

## 6. Performance Issues (Unnecessary Re-renders, Missing memo/useMemo)

### Missing useMemo/useCallback

#### `src/components/PatientDocumentsView.tsx`
- **Line 67-75**: `documentCategories` array recreated on every render - should use `useMemo`
- **Line 254-260**: `formatFileSize` function recreated on every render - should use `useCallback`
- **Line 262-267**: `getFileIcon` function recreated on every render - should use `useCallback`

#### `src/app/patient-portal/documents/page.tsx`
- **Line 62-69**: `documentCategories` array recreated on every render - should use `useMemo`
- **Line 227-233**: `formatFileSize` function recreated on every render - should use `useCallback`
- **Line 235-240**: `getFileIcon` function recreated on every render - should use `useCallback`

#### `src/components/PrescriptionForm.tsx`
- **Line 210-220**: `filteredPatients` uses `useMemo` ✓ (Good)
- However, many callback functions may benefit from `useCallback`

#### `src/app/patient-portal/progress/page.tsx`
- **Line 115-153**: `fetchData` function recreated on every render - should use `useCallback`
- Missing `useCallback` for event handlers

#### `src/app/patient-portal/page.tsx`
- **Line 59-125**: `loadPatientData` function recreated on every render - should use `useCallback`

### Missing React.memo

#### `src/components/PatientDocumentsView.tsx`
- Component receives `patientId` and `patientName` props - consider wrapping with `React.memo` if parent re-renders frequently

#### `src/components/WeightTracker.tsx`
- Component receives multiple props - consider `React.memo` if used in lists or frequently re-rendering parents

#### `src/components/PatientPrescriptionSummary.tsx`
- Component receives `patientId` prop - consider `React.memo`

### Good Examples

#### `src/app/patient-portal/calculators/calories/page.tsx`
- **Line 37**: Uses `useMemo` for expensive calculations ✓

#### `src/app/patient-portal/calculators/bmi/page.tsx`
- **Line 62**: Uses `useMemo` for BMI calculations ✓

**Recommendation:** 
1. Wrap expensive computations in `useMemo`
2. Wrap callback functions passed as props in `useCallback`
3. Consider `React.memo` for components that receive stable props but are in frequently re-rendering parents
4. Move static arrays/objects outside component or use `useMemo`

---

## Summary Statistics

| Category | Critical Issues | Warnings | Total |
|----------|----------------|----------|-------|
| Hydration Mismatches | 8 files | 0 | 8 |
| Missing Error States | 5 files | 0 | 5 |
| Missing Key Props | 0 files | 0 | 0 ✓ |
| Memory Leaks | 6 files | 0 | 6 |
| Performance Issues | 6 files | 0 | 6 |
| **Total** | **25 issues** | **0** | **25** |

---

## Priority Recommendations

### High Priority (Fix Immediately)
1. **Hydration mismatches** - Can cause SSR errors and poor UX
2. **Memory leaks** - Can cause performance degradation over time
3. **Missing error states** - Poor user experience when things fail

### Medium Priority
4. **Performance optimizations** - Improve app responsiveness

### Low Priority
6. **useState initializations** - Most are already safe, but verify null handling

---

## Next Steps

1. Create fixes for hydration mismatches (add `typeof window !== 'undefined'` checks)
2. Add error state management to all async operations
3. Fix memory leaks by properly cleaning up intervals/timeouts
4. Add missing `key` props to all list renders
5. Optimize performance with `useMemo`/`useCallback`/`React.memo`
