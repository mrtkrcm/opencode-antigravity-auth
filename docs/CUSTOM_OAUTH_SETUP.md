# Custom OAuth Client Setup Guide

This guide explains how to use your own Google OAuth client credentials with the Antigravity plugin, which is necessary if you encounter "insufficient authentication scopes" errors.

## Why You Need This

The default Antigravity OAuth client may not have permission to request all required scopes (particularly `generative-language` for Gemini API access). By creating your own OAuth client, you can:

1. Request any scopes your Google Cloud project supports
2. Have full control over the OAuth configuration
3. Avoid restrictions on the default client

## Prerequisites

- A Google Cloud Platform account
- A Google Cloud project with billing enabled
- Access to Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID (you'll need this later)

## Step 2: Enable Required APIs

Enable the following APIs in your project:

```bash
# Via gcloud CLI
gcloud services enable generativelanguage.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
gcloud services enable iam.googleapis.com

# Or via Cloud Console:
# https://console.cloud.google.com/apis/library
```

Required APIs:
- **Generative Language API** - For Gemini models
- **Cloud Resource Manager API** - For project management
- **Identity and Access Management (IAM) API** - For authentication

## Step 3: Create OAuth 2.0 Credentials

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. If prompted, configure the OAuth consent screen:
   - **User Type**: External (for personal use) or Internal (for workspace)
   - **App name**: "OpenCode Antigravity Auth" (or your choice)
   - **User support email**: Your email
   - **Developer contact**: Your email
   - **Scopes**: Add the following scopes:
     - `https://www.googleapis.com/auth/cloud-platform`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
     - `https://www.googleapis.com/auth/cclog`
     - `https://www.googleapis.com/auth/experimentsandconfigs`
     - `https://www.googleapis.com/auth/generative-language` ← **IMPORTANT**
   - **Test users**: Add your Google account email

4. Create the OAuth client:
   - **Application type**: Desktop app
   - **Name**: "OpenCode CLI" (or your choice)
   - Click **"Create"**

5. **Download the credentials**:
   - Click the download icon next to your new OAuth client
   - Save the JSON file (you'll extract values from it)

## Step 4: Extract Client Credentials

Open the downloaded JSON file and find:

```json
{
  "installed": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "client_secret": "YOUR_CLIENT_SECRET",
    ...
  }
}
```

Copy the `client_id` and `client_secret` values.

## Step 5: Configure Environment Variables

### Option A: Shell Configuration (Recommended)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
# Antigravity Custom OAuth Client
export ANTIGRAVITY_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"
export ANTIGRAVITY_CLIENT_SECRET="YOUR_CLIENT_SECRET"
export ANTIGRAVITY_SCOPES="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/cclog,https://www.googleapis.com/auth/experimentsandconfigs,https://www.googleapis.com/auth/generative-language"
```

Then reload your shell:
```bash
source ~/.zshrc  # or ~/.bashrc
```

### Option B: Per-Session

Set environment variables before running OpenCode:

```bash
export ANTIGRAVITY_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"
export ANTIGRAVITY_CLIENT_SECRET="YOUR_CLIENT_SECRET"
export ANTIGRAVITY_SCOPES="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/cclog,https://www.googleapis.com/auth/experimentsandconfigs,https://www.googleapis.com/auth/generative-language"

opencode auth login
```

### Option C: Project-Specific (.env file)

Create `.env` in your project directory:

```bash
ANTIGRAVITY_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
ANTIGRAVITY_CLIENT_SECRET=YOUR_CLIENT_SECRET
ANTIGRAVITY_SCOPES=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/cclog,https://www.googleapis.com/auth/experimentsandconfigs,https://www.googleapis.com/auth/generative-language
```

Then load it before running OpenCode:
```bash
source .env
opencode auth login
```

## Step 6: Authenticate with Custom Client

1. **Clear existing auth**:
   ```bash
   opencode auth logout google
   ```

2. **Re-authenticate** with your custom client:
   ```bash
   opencode auth login
   ```

3. **Select provider**: Google → OAuth with Google (Antigravity)

4. **Verify the OAuth URL** includes your custom client ID and all scopes:
   - Look for `client_id=YOUR_CLIENT_ID` in the URL
   - Look for `scope=...generative-language...` in the URL

5. **Complete the OAuth flow** in your browser

## Step 7: Test

Test with a Gemini 3 model:

```bash
opencode run -m google/antigravity-gemini-3-pro-high "Hello, test message"
```

If successful, you should get a response without "insufficient authentication scopes" errors.

## Troubleshooting

### Error: "Access blocked: This app's request is invalid"

**Cause**: OAuth consent screen not properly configured.

**Fix**:
1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Ensure all required scopes are added
3. Add your email to "Test users" if using External user type
4. Save and try again

### Error: "Unregistered scope(s) in the request"

**Cause**: Your OAuth client doesn't have permission to request certain scopes.

**Fix**:
1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click on your OAuth client
3. Check "Authorized scopes"
4. Ensure `generative-language` is listed
5. If not, edit the OAuth consent screen and add it

### Error: "insufficient authentication scopes" (still happening)

**Cause**: Environment variables not loaded or token not refreshed.

**Fix**:
1. Verify environment variables are set:
   ```bash
   echo $ANTIGRAVITY_CLIENT_ID
   echo $ANTIGRAVITY_SCOPES
   ```

2. Clear auth and re-authenticate:
   ```bash
   opencode auth logout google
   opencode auth login
   ```

3. Check the OAuth URL in the browser includes your custom client ID

### Error: "API [generativelanguage.googleapis.com] not enabled"

**Cause**: Generative Language API not enabled in your project.

**Fix**:
```bash
gcloud services enable generativelanguage.googleapis.com
```

Or enable via [Cloud Console](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com)

## Security Considerations

1. **Keep credentials secret**: Never commit `client_secret` to version control
2. **Use .gitignore**: Add `.env` to `.gitignore` if using env files
3. **Restrict OAuth client**: In production, restrict to specific redirect URIs
4. **Monitor usage**: Check [API usage](https://console.cloud.google.com/apis/dashboard) regularly
5. **Rotate credentials**: Periodically regenerate client secrets

## Reverting to Default Client

To revert to the default Antigravity OAuth client:

1. **Unset environment variables**:
   ```bash
   unset ANTIGRAVITY_CLIENT_ID
   unset ANTIGRAVITY_CLIENT_SECRET
   unset ANTIGRAVITY_SCOPES
   ```

2. **Remove from shell config** (if added to `~/.zshrc` or `~/.bashrc`)

3. **Re-authenticate**:
   ```bash
   opencode auth logout google
   opencode auth login
   ```

## Advanced: Scope Customization

You can customize which scopes are requested by modifying `ANTIGRAVITY_SCOPES`:

### Minimal Scopes (Antigravity only)
```bash
export ANTIGRAVITY_SCOPES="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile"
```

### Full Scopes (Antigravity + Gemini CLI)
```bash
export ANTIGRAVITY_SCOPES="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/cclog,https://www.googleapis.com/auth/experimentsandconfigs,https://www.googleapis.com/auth/generative-language"
```

## FAQ

### Q: Do I need a custom OAuth client?

**A**: Only if you encounter "insufficient authentication scopes" errors with the default client. Most users can use the default client.

### Q: Will this work with Gemini 2.5 models?

**A**: Yes, the `cloud-platform` scope provides access to both Gemini 2.5 and Gemini 3 models via Antigravity.

### Q: Can I use this with multiple Google accounts?

**A**: Yes, you can add multiple accounts during `opencode auth login`. Each account will use the same custom OAuth client.

### Q: Does this affect quota limits?

**A**: No, quota limits are determined by your Google Cloud project, not the OAuth client.

### Q: Can I share my OAuth client with teammates?

**A**: Yes, but each user should authenticate with their own Google account. Don't share the `client_secret` publicly.

## Support

If you encounter issues:

1. Check the [main README](../README.md) for general troubleshooting
2. Review [Antigravity API documentation](https://cloud.google.com/code-assist/docs)
3. Open an issue on the [GitHub repository](https://github.com/mrtkrcm/opencode-antigravity-auth)

## See Also

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Generative Language API](https://ai.google.dev/api)
