# Login Stuck on "Logging in..." — Extension Errors Resolution

## Summary

When EONPRO at app.eonpro.io shows "Logging in..." indefinitely and the browser console displays many errors (`FrameDoesNotExistError`, `ERR_FILE_NOT_FOUND` for `utils.js`, `extensionState.js`, `heuristicsRedefinitions.js`), the issue is almost always **browser extensions**, not the EONPRO application.

## Error Types Explained

| Error | Source | Meaning |
|-------|--------|---------|
| `FrameDoesNotExistError: Frame [ID] does not exist in tab` | `background.js` | Browser extension trying to access a frame that no longer exists |
| `Unchecked runtime.lastError: extension port moved to back/forward cache` | Extension | Extension's communication channel was closed |
| `Failed to load resource: net::ERR_FILE_NOT_FOUND` for `utils.js`, `extensionState.js`, `heuristicsRedefinitions.js` | Extension scripts | These are **extension** files, not EONPRO — extensions inject them; if missing or broken, the extension errors appear in the console |

## Resolution Steps (in order)

### 1. Try Incognito/Private Window (fastest test)
- Chrome: Ctrl/Cmd + Shift + N  
- Safari: File → New Private Window  
- Firefox: Ctrl/Cmd + Shift + P  

If login works in incognito → the issue is extension-related.

### 2. Disable Extensions Temporarily
Common culprits:
- **Password managers** (1Password, LastPass, Dashlane, Bitwarden, etc.)
- **Ad blockers** (uBlock Origin, AdBlock Plus)
- **Autofill/form-filling extensions**
- **Security/privacy extensions** (Privacy Badger, etc.)
- **Developer tools extensions** (React DevTools, etc.)

Disable all extensions, reload the login page, and try again.

### 3. Verify Network (DevTools → Network tab)
- Open DevTools → Network
- Attempt login
- Find the `POST` request to `/api/auth/login`

| Request state | Likely cause |
|---------------|---------------|
| Stays **pending** forever | Extension or network blocking the request |
| Blocked or CORS error | Extension blocking |
| Returns **200** with JSON | Server OK; extension may be corrupting the response on the client |
| Returns **503** | Server-side (e.g. DB connection pool); see `docs/TROUBLESHOOTING.md` "Login 503" |

### 4. Use Correct Login URL
- Main app: `https://app.eonpro.io/login`  
- Clinic-specific: `https://wellmedr.eonpro.io/login` (or your clinic subdomain)

If you're on the wrong clinic subdomain, you may see "This login page is for a different clinic."

## What EONPRO Does (Built-in Safeguards)

- **30-second timeout:** If login doesn't complete within ~30 seconds, the page clears the spinner and shows:  
  *"Login is taking too long. Try again or use an incognito window if you use password managers or extensions."*
- **503 handling:** If the server returns 503 (e.g. database busy), a countdown and retry message are shown.

## If Login Still Fails After Disabling Extensions

Then the issue may be backend or network:
- Check `docs/TROUBLESHOOTING.md` for "Login 503" and "Database Issues"
- Verify `GET https://app.eonpro.io/api/ready` returns `"database": "operational"`
- Contact support with Network tab screenshot showing the `/api/auth/login` request status

---

**References:** `docs/TROUBLESHOOTING.md` (Login stuck on "Logging in..." section)
