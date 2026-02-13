# Fix Provider Calendar Sync (Invalid provider / 400)

When the **Provider Calendar** page shows **"Invalid provider"** or the console reports **400** from `/api/calendar-sync`, use this guide.

## 1. What was fixed (Feb 2026)

The API previously only accepted `google` and `outlook` as calendar providers. The UI offers **Apple Calendar** (iCal subscription); sending `provider: 'apple'` caused schema validation to fail and return **400 "Invalid provider"**.

### Changes in `src/app/api/calendar-sync/route.ts`

| Issue | Fix |
|-------|-----|
| **POST connect** – `provider: 'apple'` rejected | `connectSchema` now allows `['google', 'outlook', 'apple']`. |
| **Apple connect** – API returned `authUrl` but Apple uses setup instructions | After `getCalendarAuthUrl`, the handler detects Apple’s `{ type: 'setup', setup }` and returns `{ success: true, setup }` so the UI can show the iCal/WebCal modal. |
| **DELETE** – Apple disconnect failed | Allowed `provider=apple` in query or body; DELETE accepts `provider` from query string or JSON body. |

## 2. If you still see errors

| Symptom | Cause | Fix |
|---------|--------|-----|
| **400 "Invalid provider"** | Request sends a provider not in `['google','outlook','apple']` or missing. | Ensure the client sends `provider: 'google' | 'outlook' | 'apple'` for connect/DELETE. |
| **404 "Provider not found"** | Logged-in user is not linked to a Provider. | Link the user to a provider: set `User.providerId` to the correct Provider id, or ensure a Provider exists with the same email (auto-link will run on next request). |
| **503 Google Calendar not configured** | Env vars missing for Google OAuth. | Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (and redirect URI in Google Console). |
| **500 "Failed to get calendar info"** | Server error (e.g. DB, calendar service). | Check server logs for the `detail` in the response; fix DB connectivity, migrations, or calendar service config. |

## 3. UI handling for “Provider not linked” (404)

When the API returns **404** with `code: 'PROVIDER_NOT_LINKED'`, the calendar UI now shows the API `hint` and a **Retry** button instead of a generic error:

- **CalendarSync** (Provider Calendar slide-out): shows hint + Retry.
- **CalendarIntegrationSettings** (settings calendar tab): shows amber banner with hint + Retry.
- **ProviderCalendarStatusCard** (dashboard): shows amber card with hint + Retry.
- **CalendarIntegrations**: shows error with hint + Retry + dismiss.

After an admin links the user to a provider (or a provider is created with the same email so auto-link runs), **Retry** will reload status and the calendar options will appear.

## 4. Verify the fix

- Open **Provider Calendar** (e.g. `/provider/calendar`).
- Click **Connect Apple Calendar** → you should get the setup modal with WebCal/HTTP URLs and QR code, not "Invalid provider".
- **Connect Google / Outlook** → should redirect to OAuth or return auth URL as before.
- **Disconnect** for any of Google, Outlook, or Apple → should succeed (query or body).
- If the account is not linked to a provider, the UI shows the hint and **Retry** (no generic “Invalid provider” or blank state).

## Summary

1. **Invalid provider (400):** Resolved by allowing `apple` in the calendar-sync API and returning Apple setup instead of an auth URL.
2. **Provider not found (404):** API returns `code: 'PROVIDER_NOT_LINKED'` and `hint`; calendar components show the hint and a Retry button.
3. Use the table in §2 for any remaining calendar sync errors.
