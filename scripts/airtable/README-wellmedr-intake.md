# Wellmedr Intake → EONPRO Airtable Script

## If you see "Field 'phone' not found" in Airtable

**Cause:** The script in your Airtable automation is an **old version** that only looks for a column literally named `phone`. Your table (e.g. from Fillout) uses a different name like "Phone Number", "Contact", or "Contact #".

**Fix:** Replace the entire script in Airtable with the **full** script from this repo.

### Steps

1. Open your Airtable base → **Automations** → open the Wellmedr intake automation → **Edit script**.
2. **Select all** (Cmd+A / Ctrl+A) and **delete** the current script.
3. Open **`wellmedr-intake-automation.js`** from this folder in your repo and **copy the entire file** (from the first `/**` to `await main();`).
4. **Paste** into the Airtable script editor.
5. Set **`CONFIG.TABLE_NAME`** (near the top) to your **exact** table name, e.g.:
   - `'Onboarding'` if your intake table is named Onboarding
   - `'2026 Q1 Fillout Intake - 1'` if that is the table name (check the tab name in Airtable).
6. **Save** and run **Test** on a record that has a phone number.

### What the full script does differently

- **FIELD_ALIASES:** For `phone` it tries, in order: `phone`, `Phone`, `Phone Number`, `Mobile`, `Cell`, `Contact #`, `Contact`, `Primary Contact Number`, and many more. So whatever your column is called, it’s likely matched.
- **getCellValueWithAliases:** Uses those aliases instead of a single `getCellValue('phone')`.
- **stringCellValue:** Turns linked records / lookups (e.g. Contacts with `phoneNumber`) into a plain string.
- **Fallback 1:** If the table has a field whose name contains "phone", "tel", "mobile", or "cell", it uses that.
- **Fallback 2:** Tries a fixed list of common names (Contact #, Contact, Phone Number, etc.) when aliases didn’t find anything.

After replacing with the full script and setting `TABLE_NAME`, the console should show either `📦 Phone: ***XXXX` (last 4 digits) or `📞 Phone from fallback field: "Your Column Name"` instead of "Field 'phone' not found".
