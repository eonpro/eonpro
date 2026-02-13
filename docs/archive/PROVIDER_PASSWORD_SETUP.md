# Provider Password Management

## Overview

The system now supports provider account passwords for enhanced security when approving SOAP notes.

## Features Added

### 1. Database Schema Updates

- Added `passwordHash` field to Provider model
- Added `passwordResetToken` and `passwordResetExpires` for future password reset functionality
- Added `lastLogin` to track provider activity

### 2. API Endpoint

- **POST** `/api/providers/[id]/set-password`
  - Sets or updates a provider's account password
  - Requires password (min 8 chars) and confirmation
  - Passwords are hashed using bcrypt

### 3. UI Components

#### ProviderPasswordSetup Component

- Modal-based password setup interface
- Shows "Set Password" for new providers
- Shows "Change Password" for providers with existing passwords
- Real-time validation and error handling

#### EditProviderForm Updates

- Added password setup button next to "Save Changes"
- Shows password status (set/not set)
- Integrated with the ProviderPasswordSetup component

### 4. Command Line Setup

- Script: `scripts/setup-provider-password.js`
- Run: `node scripts/setup-provider-password.js`
- Interactive CLI to set provider passwords

## How It Works

### Setting Up a Provider Password

1. **Via UI (Recommended)**:
   - Go to Provider profile edit page
   - Click "Set Password" button
   - Enter and confirm password (min 8 characters)
   - Click "Set Password" to save

2. **Via CLI**:
   ```bash
   node scripts/setup-provider-password.js
   ```

   - Select provider ID from list
   - Enter new password
   - Confirm password

### SOAP Note Approval Process

**Current System** (Per-Note Passwords):

- Each SOAP note gets its own password when approved
- Password is specific to that note only
- Used for editing that specific approved note

**With Provider Passwords** (Can be enhanced):

- Provider authenticates with their account password
- Can approve multiple SOAP notes without creating new passwords each time
- More secure and consistent

## Testing

1. Set up a provider password:

   ```bash
   node scripts/setup-provider-password.js
   ```

2. Access the provider edit page:
   - Navigate to `/providers/[id]`
   - Click "Edit"
   - Use the "Set Password" button

3. The password will be used for:
   - Future provider authentication
   - SOAP note approvals (when fully integrated)
   - Access control for provider-specific features

## Next Steps

To fully integrate provider passwords with SOAP note approval:

1. **Add Provider Authentication**:
   - Login page for providers
   - Session management
   - JWT tokens or session cookies

2. **Update SOAP Approval Flow**:
   - Check if provider is authenticated
   - Use provider's account password instead of per-note password
   - Or require provider password PLUS note-specific password for extra security

3. **Add Password Reset Flow**:
   - Email-based password reset using the reset token fields
   - Security questions or admin override options

## Security Notes

- Passwords are hashed with bcrypt (10 rounds)
- Never stored in plain text
- Password reset tokens should expire after use
- Consider adding 2FA for additional security
