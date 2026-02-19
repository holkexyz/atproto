# PDS OAuth + OTP Implementation Plan

## Three Apps, One PDS, Email OTP Login

---

## What We're Building

Users sign up and log in to **Certified**, **Ma Earth**, or **GainForest** using a 6-digit email code. Each app shows its own branding on the login page and in the OTP email. Under the hood, all three apps share a single PDS that already runs a working ATProto OAuth server.

We are adding OTP as an authentication method inside the existing OAuth authorize flow. OTP authenticates the user. OAuth authorizes the app. These stay separate — OTP never mints tokens.

**Scope:** Only our three apps, only our PDS, only our users. Users on other PDSes get a different login path and are not covered here.

---

## What Already Exists (Don't Rebuild)

The PDS (`@atproto/oauth-provider`) already handles:

- PAR (Pushed Authorization Requests)
- PKCE (S256, mandatory)
- DPoP (with server-issued nonces, mandatory)
- Token exchange + refresh + revocation
- Client metadata discovery (clients publish JSON at their `client_id` URL)
- Authorization server metadata (`/.well-known/oauth-authorization-server`)
- Authorize page (currently password-only)

**What we're adding:**

| Feature | Effort |
|---|---|
| `trusted_clients` table (branding + trust) | Small |
| `otp_codes` table + hashing logic | Small |
| OTP request + verify endpoints | Medium |
| Branded authorize page per app | Small |
| Branded OTP email template | Small |
| Account creation via OTP (optional signup) | Medium |

---

## Architecture

One path. User always authenticates on the PDS authorize page. Mobile apps open it in a system browser session.

```
User
 │
 ▼
App (Certified / Ma Earth / GainForest)
 │
 │  Web: opens PDS /oauth/authorize in popup
 │  Mobile: opens in ASWebAuthenticationSession (iOS) / Custom Tabs (Android)
 ▼
PDS Authorize Page (branded for the requesting app)
 │
 │  1. User enters email → receives branded OTP email → enters code
 │  2. PDS verifies OTP → sets login session cookie
 │  3. Consent (auto-approved for our apps)
 │  4. Redirect back to app with authorization code
 ▼
App
 │
 │  5. Exchange code for tokens at /oauth/token (PKCE + DPoP)
 │  6. Verify sub DID
 ▼
App has DPoP-bound access + refresh tokens
```

No custom mobile endpoints. No Variant 2A. No modifications to the OAuth provider's token issuance internals. The OTP endpoints only work within an active authorize session (bound by cookie).

---

## Database

### Trusted Clients Table

Stores branding for our three apps. This is the only place branding comes from.

```sql
CREATE TABLE trusted_clients (
  client_id       TEXT PRIMARY KEY,
  brand_name      TEXT NOT NULL,
  logo_url        TEXT,
  brand_color     TEXT,
  support_email   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO trusted_clients (client_id, brand_name, logo_url, brand_color, support_email) VALUES
  ('https://certified.earth/.well-known/oauth-client-metadata',
   'Certified', 'https://certified.earth/logo.png', '#1A1A2E', 'support@certified.earth'),
  ('https://maearth.io/.well-known/oauth-client-metadata',
   'Ma Earth', 'https://maearth.io/logo.png', '#2D6A4F', 'support@maearth.io'),
  ('https://gainforest.org/.well-known/oauth-client-metadata',
   'GainForest', 'https://gainforest.org/logo.png', '#0B6E4F', 'support@gainforest.org');
```

No metadata fetching, no `x_` custom fields, no caching logic. The PDS just reads this table.

### OTP Codes Table

```sql
CREATE TABLE otp_codes (
  id            BIGSERIAL PRIMARY KEY,
  auth_req_id   TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  email_norm    TEXT NOT NULL,
  code_hash     TEXT NOT NULL,
  salt          TEXT NOT NULL,
  attempts      INTEGER DEFAULT 0,
  max_attempts  INTEGER DEFAULT 5,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  used_at       TIMESTAMPTZ,
  request_ip    TEXT,
  ua_hash       TEXT
);

CREATE INDEX idx_otp_auth_req ON otp_codes(auth_req_id);
CREATE INDEX idx_otp_email ON otp_codes(email_norm);
CREATE INDEX idx_otp_expires ON otp_codes(expires_at);
```

Rules:
- TTL: 5 minutes
- Max 5 attempts per code, then it's burned
- One active code per `auth_req_id` (replace previous on resend)
- Never store plaintext codes

---

## OTP Hashing

```typescript
import { randomBytes, createHash, timingSafeEqual } from 'crypto';

function generateOtp(): { code: string; salt: string; codeHash: string } {
  const code = crypto.randomInt(100000, 999999).toString();
  const salt = randomBytes(16).toString('hex');
  const codeHash = createHash('sha256')
    .update(salt + code)
    .digest('hex');
  return { code, salt, codeHash };
}

function verifyOtp(inputCode: string, storedHash: string, storedSalt: string): boolean {
  const inputHash = createHash('sha256')
    .update(storedSalt + inputCode)
    .digest('hex');
  return timingSafeEqual(Buffer.from(inputHash), Buffer.from(storedHash));
}
```

---

## Session Cookies

The authorize page uses two cookies, both `HttpOnly; Secure; SameSite=Lax; Path=/oauth`:

| Cookie | Set when | Purpose |
|---|---|---|
| `pds_auth_req` | User lands on `/oauth/authorize` | Binds browser to the authorization request (holds `auth_req_id`) |
| `pds_login` | OTP verify succeeds | Identifies the authenticated user (DID) |

The OTP endpoints require `pds_auth_req`. They cannot be called outside an active authorize flow.

---

## OTP Endpoints

### POST /oauth/otp/request

```
POST /oauth/otp/request
Cookie: pds_auth_req=<auth_req_id>
Content-Type: application/json

{ "email": "alice@example.com" }
```

```typescript
async function handleOtpRequest(body: { email: string }, req: Request) {
  // 1. Read authorization context from cookie
  const authReqId = readCookie(req, 'pds_auth_req');
  if (!authReqId) throw new InvalidRequestError('No active authorization session');

  const authReq = await db.getAuthRequest(authReqId);
  if (!authReq || authReq.expiresAt < new Date())
    throw new InvalidRequestError('Authorization session expired');

  const clientId = authReq.clientId;

  // 2. Rate limit (three dimensions)
  const emailNorm = normalizeEmail(body.email);
  await enforceRateLimit('otp:email', emailNorm, { max: 3, windowMinutes: 15 });
  await enforceRateLimit('otp:ip', getClientIp(req), { max: 10, windowMinutes: 15 });
  await enforceRateLimit('otp:client', clientId, { max: 20, windowMinutes: 15 });

  // 3. Delete any previous OTP for this auth request (resend = replace)
  await db.deleteOtpByAuthReq(authReqId);

  // 4. Generate, hash, store
  const { code, salt, codeHash } = generateOtp();
  await db.insertOtpCode({
    authReqId,
    clientId,
    emailNorm,
    codeHash,
    salt,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    requestIp: getClientIp(req),
    uaHash: hashUserAgent(req.headers['user-agent']),
  });

  // 5. Send email only if account exists (prevents enumeration)
  const account = await ctx.services.account.getByEmail(emailNorm);
  if (account) {
    const branding = await db.getTrustedClient(clientId);
    await sendOtpEmail(emailNorm, code, branding);
  }

  // 6. Always 200
  return {};
}
```

### POST /oauth/otp/verify

```
POST /oauth/otp/verify
Cookie: pds_auth_req=<auth_req_id>
Content-Type: application/json

{ "email": "alice@example.com", "code": "847291" }
```

```typescript
async function handleOtpVerify(body: { email: string; code: string }, req: Request) {
  const authReqId = readCookie(req, 'pds_auth_req');
  if (!authReqId) throw new InvalidRequestError('No active authorization session');

  const emailNorm = normalizeEmail(body.email);
  const otp = await db.getOtpCode({ emailNorm, authReqId });

  if (!otp || otp.expiresAt < new Date())
    throw new InvalidRequestError('Invalid or expired code');

  if (otp.attempts >= otp.maxAttempts) {
    await db.deleteOtpCode(otp.id);
    throw new InvalidRequestError('Too many attempts, request a new code');
  }

  if (!verifyOtp(body.code, otp.codeHash, otp.salt)) {
    await db.incrementOtpAttempts(otp.id);
    throw new InvalidRequestError('Invalid code');
  }

  // Code is valid — mark used and delete
  await db.markOtpUsed(otp.id);
  await db.deleteOtpCode(otp.id);

  // Look up account
  const account = await ctx.services.account.getByEmail(emailNorm);
  if (!account) {
    // No account → signal the authorize page to show signup UI
    return { authenticated: false, account_exists: false, email_verified: true };
  }

  // Set login session cookie → authorize page continues to consent → redirect
  setLoginSessionCookie(res, account.did);
  return { authenticated: true };
}
```

No branching. No `request_uri` path. One flow.

---

## Account Creation (Optional Signup)

When OTP verify returns `account_exists: false`, the authorize page shows a handle picker:

```
┌────────────────────────────────────┐
│                                    │
│         [Ma Earth logo]            │
│                                    │
│   Create your account              │
│                                    │
│   ┌──────────────────┐             │
│   │  alice            │.certified.earth
│   └──────────────────┘             │
│                                    │
│   [ Create account ]               │
│                                    │
└────────────────────────────────────┘
```

This is handled on the PDS authorize page itself — the user picks a handle, the PDS creates the account (DID, repo, random internal password), sets the login cookie, and the OAuth flow continues. No additional endpoint needed; it's a form submission on the authorize page.

Email is already verified by the OTP step.

---

## Branded Authorize Page

The authorize page reads branding from `trusted_clients` by `client_id`:

```
┌────────────────────────────────────┐
│                                    │
│         [App logo]                 │
│                                    │
│   Sign in to continue to {name}   │
│                                    │
│   ┌──────────────────────────┐     │
│   │  Email                   │     │
│   └──────────────────────────┘     │
│                                    │
│   [ Send me a code ]  ← {color}   │
│                                    │
│   ─── or ───                       │
│                                    │
│   [ Sign in with password ]        │
│                                    │
│   Don't have an account?           │
│   [ Create account ]               │
│                                    │
└────────────────────────────────────┘
```

After "Send me a code":

```
┌────────────────────────────────────┐
│                                    │
│         [App logo]                 │
│                                    │
│   Enter your code                  │
│                                    │
│   Sent to alice@example.com        │
│                                    │
│   ┌──────────────────────────┐     │
│   │  ______                  │     │
│   └──────────────────────────┘     │
│                                    │
│   [ Verify ]  ← {color}           │
│                                    │
│   Didn't get it? [Resend]          │
│   (60s cooldown)                   │
│                                    │
└────────────────────────────────────┘
```

Support `login_hint` from the authorization request to pre-fill the email field.

---

## OTP Email Template

One template. All three apps are trusted, so every email is branded.

```typescript
async function sendOtpEmail(
  email: string,
  code: string,
  branding: TrustedClient | null,
) {
  const brandName = branding?.brand_name ?? 'Your account';
  const brandColor = branding?.brand_color ?? '#333333';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             margin: 0; padding: 40px 20px; background: #f5f5f5;">
  <div style="max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px;
              overflow: hidden;">
    <div style="background: ${sanitize(brandColor)}; padding: 32px; text-align: center;">
      ${branding?.logo_url
        ? `<img src="${sanitize(branding.logo_url)}" alt="${sanitize(brandName)}"
               style="height: 40px; margin-bottom: 12px;">`
        : ''}
      <h1 style="color: #fff; margin: 0; font-size: 20px;">
        Sign in to ${sanitize(brandName)}
      </h1>
    </div>
    <div style="padding: 32px; text-align: center;">
      <p style="color: #333; font-size: 16px; margin: 0 0 24px;">Your login code is:</p>
      <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px;
                  color: ${sanitize(brandColor)}; padding: 16px; background: #f8f8f8;
                  border-radius: 8px; display: inline-block;">
        ${code}
      </div>
      <p style="color: #888; font-size: 14px; margin: 24px 0 0;">
        This code expires in 5 minutes.
      </p>
    </div>
    <div style="padding: 20px 32px; border-top: 1px solid #eee; text-align: center;">
      <p style="color: #999; font-size: 12px; margin: 0;">
        Didn't request this? You can safely ignore this email.
        ${branding?.support_email
          ? `<br>Questions? Contact <a href="mailto:${sanitize(branding.support_email)}"
               style="color: ${sanitize(brandColor)};">${sanitize(branding.support_email)}</a>`
          : ''}
      </p>
    </div>
  </div>
</body>
</html>`;

  await mailer.sendMail({
    to: email,
    from: cfg.email.fromAddress,
    subject: `${code} is your ${brandName} login code`,
    html,
  });
}
```

**What users see per app:**

| App | Email subject | Header color | Logo |
|---|---|---|---|
| Certified | `847291 is your Certified login code` | `#1A1A2E` | Certified logo |
| Ma Earth | `293018 is your Ma Earth login code` | `#2D6A4F` | Ma Earth logo |
| GainForest | `510472 is your GainForest login code` | `#0B6E4F` | GainForest logo |

Set up SPF, DKIM, DMARC for the sending domain.

---

## Rate Limiting

Three dimensions on OTP endpoints:

| Dimension | Limit | Prevents |
|---|---|---|
| Per email | 3 requests / 15 min | Inbox spam |
| Per IP | 10 requests / 15 min | Bulk abuse |
| Per client_id | 20 requests / 15 min | Compromised app flooding |
| Per code | 5 verify attempts then burned | Brute force |

Plus a 60-second resend cooldown in the UI.

All other rate limits (PAR, token exchange, revocation) are already handled by `@atproto/oauth-provider`.

---

## Client Metadata Documents

Each app hosts a client metadata JSON document. Since we only need the web authorize page flow (mobile uses system browser pointing to the same page), each app needs **one** metadata document.

**Certified:**
```
GET https://certified.earth/.well-known/oauth-client-metadata
```
```json
{
  "client_id": "https://certified.earth/.well-known/oauth-client-metadata",
  "application_type": "web",
  "client_name": "Certified",
  "client_uri": "https://certified.earth",
  "logo_uri": "https://certified.earth/logo.png",
  "redirect_uris": ["https://certified.earth/oauth/callback"],
  "scope": "atproto transition:generic",
  "response_types": ["code"],
  "grant_types": ["authorization_code", "refresh_token"],
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "jwks_uri": "https://certified.earth/.well-known/jwks.json"
}
```

**Ma Earth:**
```
GET https://maearth.io/.well-known/oauth-client-metadata
```
```json
{
  "client_id": "https://maearth.io/.well-known/oauth-client-metadata",
  "application_type": "web",
  "client_name": "Ma Earth",
  "client_uri": "https://maearth.io",
  "logo_uri": "https://maearth.io/logo.png",
  "redirect_uris": ["https://maearth.io/oauth/callback"],
  "scope": "atproto transition:generic",
  "response_types": ["code"],
  "grant_types": ["authorization_code", "refresh_token"],
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "jwks_uri": "https://maearth.io/.well-known/jwks.json"
}
```

**GainForest:**
```
GET https://gainforest.org/.well-known/oauth-client-metadata
```
```json
{
  "client_id": "https://gainforest.org/.well-known/oauth-client-metadata",
  "application_type": "web",
  "client_name": "GainForest",
  "client_uri": "https://gainforest.org",
  "logo_uri": "https://gainforest.org/logo.png",
  "redirect_uris": ["https://gainforest.org/oauth/callback"],
  "scope": "atproto transition:generic",
  "response_types": ["code"],
  "grant_types": ["authorization_code", "refresh_token"],
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "jwks_uri": "https://gainforest.org/.well-known/jwks.json"
}
```

Each web backend generates an ES256 key pair and serves the public key at its `jwks_uri`. Mobile apps use the same `client_id` — the system browser session redirects to the web callback URL, and the web backend relays the session back to the mobile app (or the mobile app intercepts via Universal Links / App Links registered on the same domain).

---

## App Integration

Use the ATProto SDKs. Don't write raw OAuth.

**Web app:**

```typescript
import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

const client = new BrowserOAuthClient({
  clientMetadata: {
    client_id: 'https://maearth.io/.well-known/oauth-client-metadata',
    // ...
  },
  handleResolver: 'https://pds.certified.earth',
});

// Start login — opens PDS authorize page (now with OTP option)
await client.signIn('alice.certified.earth');
// SDK handles PKCE, DPoP (with nonce retry), PAR, token exchange, sub verification
```

**Server-side (Node, confidential client):**

```typescript
import { NodeOAuthClient } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';

const client = new NodeOAuthClient({
  clientMetadata: { /* same as metadata document */ },
  keyset: [await JoseKey.fromImportable(process.env.PRIVATE_KEY_ES256!)],
  stateStore: { /* redis or DB */ },
  sessionStore: { /* redis or DB */ },
});

// Login route
app.get('/login', async (req, res) => {
  const url = await client.authorize(req.query.handle);
  res.redirect(url);
});

// Callback
app.get('/oauth/callback', async (req, res) => {
  const { session } = await client.callback(new URLSearchParams(req.url.split('?')[1]));
  // session.sub = verified DID
});
```

**Mobile:** Open the PDS authorize URL in `ASWebAuthenticationSession` (iOS) or Custom Tabs (Android). The redirect goes to the app's HTTPS callback URL, which the mobile app intercepts via Universal Links / App Links. The SDK handles everything else identically.

---

## Consent

Auto-approve for our three apps. The user verifying an OTP code is sufficient signal — no additional consent screen needed for first-party trusted clients. The `trusted_clients` table is the gate.

---

## Security Summary

| Control | How |
|---|---|
| OTP codes hashed | SHA-256 with random salt, constant-time comparison |
| OTP bound to auth session | `pds_auth_req` cookie required, code tied to `auth_req_id` |
| No email enumeration | Always return 200 from OTP request |
| Brute force protection | 5 attempts then code is burned |
| Rate limiting | Per email, per IP, per client_id |
| Session cookies | HttpOnly, Secure, SameSite=Lax, Path=/oauth |
| Branding trust-gated | Only from `trusted_clients` DB table |
| Audit trail | `request_ip` + `ua_hash` stored per OTP request |
| DPoP + PKCE | Handled by existing OAuth server (untouched) |
| Email security | SPF + DKIM + DMARC, sanitized template variables |

---

## Implementation Order

### Week 1–2: OTP Backend

1. Create `trusted_clients` table migration + seed data for three apps
2. Create `otp_codes` table migration
3. Implement `generateOtp()` + `verifyOtp()` utilities
4. Add `pds_auth_req` session cookie to authorize page
5. Implement `POST /oauth/otp/request`
6. Implement `POST /oauth/otp/verify`
7. Add three-dimensional rate limiting
8. Wire up login session cookie on successful verify

### Week 2–3: Branded UI + Emails

9. Modify authorize page to show OTP login option (email input → code input)
10. Load branding from `trusted_clients` for the requesting `client_id`
11. Build branded OTP email template
12. Wire up email sending via nodemailer
13. Test across Gmail, Outlook, Apple Mail for all three brands
14. Add `login_hint` prefill support

### Week 3–4: Account Creation + App Integration

15. Add signup flow to authorize page (handle picker after OTP verify when no account exists)
16. Host client metadata documents on all three app domains
17. Generate ES256 key pairs and serve JWKS for each app
18. Integrate OAuth in web apps using `@atproto/oauth-client-node`
19. Integrate mobile OAuth via system browser sessions
20. Test cross-app flows (sign up on Ma Earth, log in on Certified)

### Week 4–5: Hardening

21. Penetration testing on OTP endpoints
22. Email deliverability testing (SPF/DKIM/DMARC)
23. Periodic cleanup of expired OTP codes (cron job)
24. Build "Connected Apps" view in Certified using existing OAuth session data
25. Security log using `request_ip` / `ua_hash` from OTP records

---

## What We're NOT Building

- **No Variant 2A / custom mobile endpoints.** Mobile uses the standard system browser flow.
- **No separate mobile client metadata.** One metadata document per app.
- **No untrusted client handling.** We only serve our three apps. If we add third-party support later, we add a generic unbranded path then.
- **No modifications to token issuance.** The OAuth server's PAR, PKCE, DPoP, token exchange, refresh, and revocation are untouched.
- **No BFF pattern.** Start with the web confidential client approach. Add BFF only if mobile session lifetimes become a problem.

---

## PDS Code Changes (Complete List)

| Change | Where | Size |
|---|---|---|
| `trusted_clients` table | Migration file | Trivial |
| `otp_codes` table | Migration file | Trivial |
| OTP hashing utilities | New: `src/auth/otp.ts` | Small |
| `pds_auth_req` cookie on authorize | Modify authorize handler | Small |
| `POST /oauth/otp/request` | New route | Medium |
| `POST /oauth/otp/verify` | New route | Medium |
| Branded OTP email template + sender | New: `src/mailer/otp.ts` | Small |
| Authorize page: OTP login + signup | Modify existing authorize UI | Medium |
| Rate limiting (3 dimensions) | New or extend existing | Small |

Everything else is untouched.
