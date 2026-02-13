# SOAP Notes Display Filtering

## What Changed

The SOAP notes display now filters out duplicate test generations, showing only the most recent SOAP
note per intake document.

## Why It Was Needed

During development and testing, multiple SOAP notes were generated for the same intake document:

- Patricia had 6 SOAP notes total
- 3 from intake document #6
- 3 from intake document #13

This created clutter in the UI with duplicate/test SOAP notes.

## The Solution

Updated the `getPatientSOAPNotes` function in `src/services/ai/soapNoteService.ts` to:

1. **Still filter for only intake-generated notes** (not manual samples):
   - `sourceType: 'HEYFLOW_INTAKE'`
   - `generatedByAI: true`
   - `intakeDocumentId: { not: null }`

2. **Additionally filter to show only the most recent SOAP note per intake document**:
   - Groups SOAP notes by intake document ID
   - Keeps only the newest one from each group
   - Eliminates duplicate test generations

## Result

Patricia now sees only 2 SOAP notes instead of 6:

- SOAP Note #14 (most recent from Intake #13)
- SOAP Note #11 (most recent from Intake #6)

This provides a cleaner, more professional view showing only the relevant SOAP notes generated from
actual patient intake forms.
