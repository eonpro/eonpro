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

## 5. Google OAuth 401 invalid_client (“The OAuth client was not found”)

If connecting **Google Calendar** redirects to Google and then shows **“Access blocked: Authorization Error”** with **Error 401: invalid_client**, Google is rejecting the OAuth request. Fix it in **Google Cloud Console** and your **environment**.

### Checklist

1. **OAuth client exists**
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → your project → **APIs & Services** → **Credentials**.
   - Under **OAuth 2.0 Client IDs**, confirm there is a **Web application** client (not “Desktop” or “Android”).
   - If the client was deleted or you use a different project, create a new **Web application** client and use its **Client ID** and **Client secret** in your env.

2. **Client ID and secret in env**
   - The app uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. They must match the **exact** values from that OAuth client (copy-paste, no extra spaces).
   - Restart the app after changing env so the new values are loaded.

3. **Redirect URI must match exactly**
   - The app sends this redirect URI to Google:
     - If `GOOGLE_REDIRECT_URI` is set → that value.
     - Else → `NEXTAUTH_URL` + `/api/calendar-sync/google/callback`.
   - Examples:
     - Production: `https://app.eonpro.io/api/calendar-sync/google/callback` (if `NEXTAUTH_URL=https://app.eonpro.io`).
     - Local: `http://localhost:3000/api/calendar-sync/google/callback` (if you run on port 3000).
   - In Google Cloud Console → **Credentials** → your OAuth client → **Authorized redirect URIs**:
     - Add the **exact** URL above (same scheme, host, port, path — no trailing slash unless the app sends it).
   - If you use both production and local, add **both** redirect URIs.

4. **Verify what the app sends**
   - When a provider clicks “Connect” for Google, the API returns a `_debug` object with `redirectUri` and `clientId` (see `src/app/api/calendar-sync/route.ts`). You can compare:
     - `_debug.redirectUri` must be one of the URIs listed in Google Console.
     - `_debug.clientId` must match the OAuth client’s Client ID.

5. **Google Calendar API enabled**
   - In Google Cloud Console → **APIs & Services** → **Library** → enable **Google Calendar API** for the same project that owns the OAuth client.

After fixing, try connecting Google Calendar again (use an incognito window or a different browser if you want to avoid cached redirects).

## 6. Apple Calendar “Validation failed” on iPhone

When adding a **Subscribed Calendar** on iPhone, if you see **“Validation failed. Please edit the URL and try again”**, the usual cause is using an **http://** URL. Apple requires **https://** for subscription feeds.

**Fix:**

- Use the **HTTPS** URL, not the HTTP one. In the “Add to Apple Calendar” modal we now always generate HTTPS URLs. Copy the **“HTTPS URL”** (or **WebCal URL**) from the modal.
- Correct format: `https://eonpro.vercel.app/api/calendar/ical/YOUR_FULL_TOKEN` (or your real domain). Use the full token — don’t truncate it.
- On iPhone: **Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar**, then paste the **https://** URL.

If your deployment was built before this fix, the modal might have shown an http URL. After redeploying, the app will show only https URLs for new and existing subscriptions.

---

## Summary

1. **Invalid provider (400):** Resolved by allowing `apple` in the calendar-sync API and returning Apple setup instead of an auth URL.
2. **Provider not found (404):** API returns `code: 'PROVIDER_NOT_LINKED'` and `hint`; calendar components show the hint and a Retry button.
3. **Google 401 invalid_client:** Fix OAuth client and redirect URI in Google Cloud Console and env; see §5.
4. **Apple “Validation failed” on iPhone:** Use the HTTPS subscription URL (not http); see §6.
5. Use the table in §2 for any remaining calendar sync errors.
