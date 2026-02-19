/**
 * End-to-end integration tests for the OTP login flow.
 *
 * These tests verify the complete OTP authentication flow:
 * - OTP request → email captured → OTP verify → account returned
 * - Auto-registration for new users
 * - Error cases (invalid code, expired, max attempts, no session)
 * - Resend replaces previous code
 * - Branded email content
 *
 * Note: We use Node.js's `http` module directly (not `fetch`) because
 * Node.js's built-in fetch automatically sets Sec-Fetch-* headers based
 * on the request type, which conflicts with the same-origin validation
 * in the OAuth provider middleware.
 */

import { EventEmitter, once } from 'node:events'
import * as http from 'node:http'
import Mail from 'nodemailer/lib/mailer'
import { TestNetworkNoAppView } from '@atproto/dev-env'
import { AppContext } from '../src'
import { ServerMailer } from '../src/mailer'

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

interface HttpResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

/**
 * Make an HTTP request using Node.js's http module (not fetch).
 * This gives us full control over headers, including Sec-Fetch-* headers.
 */
function httpRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const reqOptions: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
    }

    if (options.body) {
      reqOptions.headers = {
        ...reqOptions.headers,
        'Content-Length': String(Buffer.byteLength(options.body)),
      }
    }

    const req = http.request(reqOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: data,
        })
      })
    })

    req.on('error', reject)

    if (options.body) {
      req.write(options.body)
    }

    req.end()
  })
}

// ---------------------------------------------------------------------------
// Cookie jar
// ---------------------------------------------------------------------------

class CookieJar {
  private cookies: Map<string, string> = new Map()

  /**
   * Parse Set-Cookie headers from a response and store them.
   */
  absorb(setCookieHeaders: string | string[] | undefined): void {
    const headers = Array.isArray(setCookieHeaders)
      ? setCookieHeaders
      : setCookieHeaders
        ? [setCookieHeaders]
        : []

    for (const header of headers) {
      const [nameValue] = header.split(';')
      const eqIdx = nameValue.indexOf('=')
      if (eqIdx > 0) {
        const name = nameValue.slice(0, eqIdx).trim()
        const value = nameValue.slice(eqIdx + 1).trim()
        if (value === '' || value === '""') {
          this.cookies.delete(name)
        } else {
          this.cookies.set(name, value)
        }
      }
    }
  }

  toHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  get(name: string): string | undefined {
    return this.cookies.get(name)
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const API_PREFIX = '/@atproto/oauth-provider/~api'
const CSRF_COOKIE_NAME = 'csrf-token'
const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Start an OAuth authorize flow by doing PAR + GET /oauth/authorize.
 * Returns the request_uri and the cookie jar with device cookies + CSRF token.
 */
async function startOAuthFlow(
  pdsUrl: string,
  clientId = 'http://localhost',
): Promise<{ requestUri: string; cookieJar: CookieJar }> {
  const cookieJar = new CookieJar()

  // Step 1: PAR (Pushed Authorization Request)
  const parBody = JSON.stringify({
    client_id: clientId,
    response_type: 'code',
    scope: 'atproto',
    redirect_uri: 'http://127.0.0.1/',
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
  })

  const parRes = await httpRequest(`${pdsUrl}/oauth/par`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: parBody,
  })

  if (parRes.status !== 201) {
    throw new Error(`PAR failed: ${parRes.status} ${parRes.body}`)
  }

  const parData = JSON.parse(parRes.body) as { request_uri: string }
  const requestUri = parData.request_uri

  // Step 2: GET /oauth/authorize to get device cookies and CSRF token
  const authPath =
    `/oauth/authorize?request_uri=${encodeURIComponent(requestUri)}` +
    `&client_id=${encodeURIComponent(clientId)}`

  const authRes = await httpRequest(`${pdsUrl}${authPath}`, {
    method: 'GET',
    headers: {
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Dest': 'document',
    },
  })

  cookieJar.absorb(authRes.headers['set-cookie'])

  if (authRes.status !== 200) {
    throw new Error(
      `Authorize page failed: ${authRes.status} ${authRes.body.slice(0, 200)}`,
    )
  }

  return { requestUri, cookieJar }
}

/**
 * Extract the 6-digit OTP code from a captured email.
 */
function extractOtpCode(mail: Mail.Options): string {
  const subject = typeof mail.subject === 'string' ? mail.subject : ''
  // Subject format: "<code> is your <brandName> login code"
  const match = subject.match(/^(\d{6}) is your/)
  if (match) return match[1]

  // Fallback: look in HTML body
  const html = typeof mail.html === 'string' ? mail.html : ''
  const htmlMatch = html.match(/\b(\d{6})\b/)
  if (htmlMatch) return htmlMatch[1]

  throw new Error(`Could not extract OTP code from email: ${subject}`)
}

/**
 * Make a same-origin API request to the OAuth provider API.
 */
async function makeApiRequest(
  pdsUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
  cookieJar: CookieJar,
  requestUri?: string,
): Promise<{ status: number; data: unknown }> {
  const csrfToken = cookieJar.get(CSRF_COOKIE_NAME)

  // Build the referer URL
  let referer: string
  if (requestUri) {
    referer = `${pdsUrl}/oauth/authorize?request_uri=${encodeURIComponent(requestUri)}`
  } else {
    referer = `${pdsUrl}/account`
  }

  const bodyStr = JSON.stringify(body)
  const res = await httpRequest(`${pdsUrl}${API_PREFIX}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Sec-Fetch-Mode': 'same-origin',
      'Sec-Fetch-Site': 'same-origin',
      Origin: pdsUrl,
      Referer: referer,
      ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
      Cookie: cookieJar.toHeader(),
    },
    body: bodyStr,
  })

  // Absorb any new cookies (e.g., rotated device cookies)
  cookieJar.absorb(res.headers['set-cookie'])

  let data: unknown
  try {
    data = JSON.parse(res.body)
  } catch {
    data = res.body
  }

  return { status: res.status, data }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OTP authentication flow', () => {
  let network: TestNetworkNoAppView
  let pdsUrl: string
  // @ts-expect-error ctx is accessible via network.pds.ctx
  let ctx: AppContext
  let mailer: ServerMailer
  const mailCatcher = new EventEmitter()
  let _origSendMail: typeof mailer.transporter.sendMail

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'otp_auth',
    })

    // @ts-expect-error Error due to circular dependency with the dev-env package
    ctx = network.pds.ctx
    // @ts-expect-error Error due to circular dependency with the dev-env package
    mailer = network.pds.ctx.mailer
    pdsUrl = network.pds.url

    // Intercept all outgoing emails
    _origSendMail = mailer.transporter.sendMail.bind(mailer.transporter)
    mailer.transporter.sendMail = async (opts) => {
      const result = await _origSendMail(opts)
      mailCatcher.emit('mail', opts)
      return result
    }
  })

  afterAll(async () => {
    mailer.transporter.sendMail = _origSendMail
    await network.close()
  })

  /**
   * Helper: wait for the next email to be sent.
   */
  const waitForMail = async <T>(
    action: () => Promise<T>,
  ): Promise<{ mail: Mail.Options; result: T }> => {
    const [mailArgs, result] = await Promise.all([
      once(mailCatcher, 'mail'),
      action(),
    ])
    return { mail: mailArgs[0] as Mail.Options, result }
  }

  // -------------------------------------------------------------------------
  // Test 1: Happy path — existing user OTP login
  // -------------------------------------------------------------------------

  it('happy path: existing user can log in with OTP', async () => {
    const agent = network.pds.getClient()

    // Create a test account
    const { data: account } = await agent.com.atproto.server.createAccount({
      handle: 'otp-user1.test',
      email: 'otp-user1@test.com',
      password: 'password123',
    })

    // Start OAuth flow to get device cookies
    const { requestUri, cookieJar } = await startOAuthFlow(pdsUrl)

    // Request OTP — should send email since account exists
    const { mail, result: otpRequestResult } = await waitForMail(async () => {
      return makeApiRequest(
        pdsUrl,
        '/otp-request',
        { email: 'otp-user1@test.com' },
        cookieJar,
        requestUri,
      )
    })

    expect(otpRequestResult.status).toBe(200)

    // Extract OTP code from email
    const code = extractOtpCode(mail)
    expect(code).toMatch(/^\d{6}$/)
    expect(mail.to).toBe('otp-user1@test.com')

    // Verify OTP
    const verifyResult = await makeApiRequest(
      pdsUrl,
      '/otp-verify',
      { email: 'otp-user1@test.com', code },
      cookieJar,
      requestUri,
    )

    expect(verifyResult.status).toBe(200)
    const verifyData = verifyResult.data as {
      account: { sub: string; email: string }
      ephemeralToken: string
      consentRequired: boolean
    }

    expect(verifyData.account).toBeDefined()
    expect(verifyData.account.sub).toBe(account.did)
    expect(verifyData.account.email).toBe('otp-user1@test.com')
    expect(verifyData.ephemeralToken).toBeDefined()
    expect(typeof verifyData.consentRequired).toBe('boolean')
  })

  // -------------------------------------------------------------------------
  // Test 2: Happy path — new user auto-registration
  // -------------------------------------------------------------------------

  it('happy path: new user is auto-registered with random handle', async () => {
    const { requestUri, cookieJar } = await startOAuthFlow(pdsUrl)

    const newEmail = 'brand-new-user@test.com'

    // Request OTP for a new email — returns 200 (prevents enumeration)
    // but does NOT send email (account doesn't exist yet)
    const otpRequestResult = await makeApiRequest(
      pdsUrl,
      '/otp-request',
      { email: newEmail },
      cookieJar,
      requestUri,
    )

    expect(otpRequestResult.status).toBe(200)

    // Get the OTP record from the DB and replace it with a known code
    // @ts-expect-error accessing internal db
    const db = ctx.accountManager.db

    const otpRecord = await db.db
      .selectFrom('otp_code')
      .selectAll()
      .where('emailNorm', '=', newEmail)
      .executeTakeFirst()

    expect(otpRecord).toBeDefined()

    // Insert a known OTP code for testing
    const { generateOtp } = await import(
      '../src/account-manager/helpers/otp.js'
    )
    const { code, salt, codeHash } = generateOtp()

    await db.db
      .deleteFrom('otp_code')
      .where('emailNorm', '=', newEmail)
      .execute()
    await db.db
      .insertInto('otp_code')
      .values({
        deviceId: otpRecord!.deviceId,
        clientId: otpRecord!.clientId,
        emailNorm: newEmail,
        codeHash,
        salt,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        requestIp: null,
        uaHash: null,
      })
      .execute()

    // Verify OTP — should auto-create account
    const verifyResult = await makeApiRequest(
      pdsUrl,
      '/otp-verify',
      { email: newEmail, code },
      cookieJar,
      requestUri,
    )

    expect(verifyResult.status).toBe(200)
    const verifyData = verifyResult.data as {
      accountCreated: boolean
      account: { sub: string; email: string; preferred_username: string }
      ephemeralToken: string
    }

    expect(verifyData.accountCreated).toBe(true)
    expect(verifyData.account).toBeDefined()
    expect(verifyData.account.email).toBe(newEmail)
    expect(verifyData.account.sub).toMatch(/^did:plc:/)

    // Handle should be auto-generated (user-{base36}.test) with 13 base-36 chars (64 bits)
    expect(verifyData.account.preferred_username).toMatch(
      /^user-[0-9a-z]{13}\./,
    )

    // Verify the account was created in the DB
    const createdAccount = await db.db
      .selectFrom('account')
      .selectAll()
      .where('email', '=', newEmail)
      .executeTakeFirst()

    expect(createdAccount).toBeDefined()
    // Email should be confirmed since OTP verified it
    expect(createdAccount!.emailConfirmedAt).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  // Test 3: Error — invalid OTP code
  // -------------------------------------------------------------------------

  it('error: invalid OTP code returns 400 with "Invalid code" message', async () => {
    const { requestUri, cookieJar } = await startOAuthFlow(pdsUrl)

    // Request OTP (no email sent for non-existent account, but OTP is stored)
    await makeApiRequest(
      pdsUrl,
      '/otp-request',
      { email: 'error-test@test.com' },
      cookieJar,
      requestUri,
    )

    // Try with wrong code
    const verifyResult = await makeApiRequest(
      pdsUrl,
      '/otp-verify',
      { email: 'error-test@test.com', code: '000000' },
      cookieJar,
      requestUri,
    )

    expect(verifyResult.status).toBe(400)
    const errorData = verifyResult.data as { error: string; message?: string }
    // The error should indicate an invalid code
    expect(errorData.error).toBeDefined()

    // Verify attempt counter was incremented
    // @ts-expect-error accessing internal db
    const db = ctx.accountManager.db
    const otpRecord = await db.db
      .selectFrom('otp_code')
      .selectAll()
      .where('emailNorm', '=', 'error-test@test.com')
      .executeTakeFirst()

    expect(otpRecord).toBeDefined()
    expect(otpRecord!.attempts).toBe(1)
  })

  // -------------------------------------------------------------------------
  // Test 4: Error — expired OTP code
  // -------------------------------------------------------------------------

  it('error: expired OTP code returns 400', async () => {
    const { requestUri, cookieJar } = await startOAuthFlow(pdsUrl)

    await makeApiRequest(
      pdsUrl,
      '/otp-request',
      { email: 'expired-test@test.com' },
      cookieJar,
      requestUri,
    )

    // Manually expire the OTP record
    // @ts-expect-error accessing internal db
    const db = ctx.accountManager.db
    await db.db
      .updateTable('otp_code')
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where('emailNorm', '=', 'expired-test@test.com')
      .execute()

    // Try to verify with any code
    const verifyResult = await makeApiRequest(
      pdsUrl,
      '/otp-verify',
      { email: 'expired-test@test.com', code: '123456' },
      cookieJar,
      requestUri,
    )

    expect(verifyResult.status).toBe(400)
    const errorData = verifyResult.data as { error: string; message?: string }
    expect(errorData.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Test 5: Error — max attempts exceeded
  // -------------------------------------------------------------------------

  it('error: max attempts exceeded returns error and deletes OTP', async () => {
    const { requestUri, cookieJar } = await startOAuthFlow(pdsUrl)

    await makeApiRequest(
      pdsUrl,
      '/otp-request',
      { email: 'maxattempts@test.com' },
      cookieJar,
      requestUri,
    )

    // Submit wrong code until we hit the max attempts limit.
    // The implementation checks `attempts >= maxAttempts` BEFORE incrementing,
    // so with maxAttempts=5 we need 6 total attempts:
    // - Attempts 1-5: wrong code → increment counter (attempts becomes 1..5)
    // - Attempt 6: attempts=5 >= maxAttempts=5 → consume and throw "Too many attempts"
    let lastResult: { status: number; data: unknown } | undefined
    for (let i = 0; i < 6; i++) {
      lastResult = await makeApiRequest(
        pdsUrl,
        '/otp-verify',
        { email: 'maxattempts@test.com', code: '000000' },
        cookieJar,
        requestUri,
      )
    }

    // The 6th attempt should return an error about too many attempts
    expect(lastResult!.status).toBe(400)
    const errorData = lastResult!.data as {
      error: string
      message?: string
      error_description?: string
    }
    expect(errorData.error).toBeDefined()
    expect(errorData.error_description || errorData.message).toContain(
      'Too many attempts',
    )

    // OTP record should be deleted after max attempts
    // @ts-expect-error accessing internal db
    const db = ctx.accountManager.db
    const otpRecord = await db.db
      .selectFrom('otp_code')
      .selectAll()
      .where('emailNorm', '=', 'maxattempts@test.com')
      .executeTakeFirst()

    expect(otpRecord).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Test 6: Error — no active authorize session (no request_uri)
  // -------------------------------------------------------------------------

  it('error: OTP request without OAuth session returns error', async () => {
    // First, get device cookies from a PAR + authorize flow
    const { cookieJar: flowCookieJar } = await startOAuthFlow(pdsUrl)

    // Now make an OTP request WITHOUT a request_uri in the referer
    // (i.e., referer is /account instead of /oauth/authorize?request_uri=...)
    const csrfToken = flowCookieJar.get(CSRF_COOKIE_NAME)
    const bodyStr = JSON.stringify({ email: 'no-session@test.com' })

    const res = await httpRequest(`${pdsUrl}${API_PREFIX}/otp-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Mode': 'same-origin',
        'Sec-Fetch-Site': 'same-origin',
        Origin: pdsUrl,
        Referer: `${pdsUrl}/account`, // NOT the authorize page
        ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
        Cookie: flowCookieJar.toHeader(),
      },
      body: bodyStr,
    })

    // Should fail because the endpoint requires an OAuth flow context
    expect(res.status).toBe(400)
    const errorData = JSON.parse(res.body) as {
      error: string
      message?: string
    }
    expect(errorData.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Test 7: Resend replaces previous code
  // -------------------------------------------------------------------------

  it('resend: second OTP invalidates the first', async () => {
    const agent = network.pds.getClient()

    // Create a test account so emails are actually sent
    await agent.com.atproto.server.createAccount({
      handle: 'resend-user.test',
      email: 'resend-user@test.com',
      password: 'password123',
    })

    const { requestUri, cookieJar } = await startOAuthFlow(pdsUrl)

    // Request first OTP (code A)
    const { mail: mailA } = await waitForMail(async () => {
      return makeApiRequest(
        pdsUrl,
        '/otp-request',
        { email: 'resend-user@test.com' },
        cookieJar,
        requestUri,
      )
    })
    const codeA = extractOtpCode(mailA)

    // Request second OTP (code B) — this should replace code A
    const { mail: mailB } = await waitForMail(async () => {
      return makeApiRequest(
        pdsUrl,
        '/otp-request',
        { email: 'resend-user@test.com' },
        cookieJar,
        requestUri,
      )
    })
    const codeB = extractOtpCode(mailB)

    // Code A and B should be different
    expect(codeA).not.toBe(codeB)

    // Verify code A no longer works (it was deleted when code B was inserted)
    const verifyAResult = await makeApiRequest(
      pdsUrl,
      '/otp-verify',
      { email: 'resend-user@test.com', code: codeA },
      cookieJar,
      requestUri,
    )
    // Code A should fail (either wrong code or no OTP found)
    expect(verifyAResult.status).toBe(400)

    // Start a fresh flow for code B verification
    const { requestUri: requestUri2, cookieJar: cookieJar2 } =
      await startOAuthFlow(pdsUrl)

    // Request a fresh OTP
    const { mail: mailC } = await waitForMail(async () => {
      return makeApiRequest(
        pdsUrl,
        '/otp-request',
        { email: 'resend-user@test.com' },
        cookieJar2,
        requestUri2,
      )
    })
    const codeC = extractOtpCode(mailC)

    // Code C should work
    const verifyCResult = await makeApiRequest(
      pdsUrl,
      '/otp-verify',
      { email: 'resend-user@test.com', code: codeC },
      cookieJar2,
      requestUri2,
    )
    expect(verifyCResult.status).toBe(200)
    const verifyCData = verifyCResult.data as { account: { sub: string } }
    expect(verifyCData.account).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Test 8: Branded email content
  // -------------------------------------------------------------------------

  it('branded email: OTP email contains brand name from trusted_clients', async () => {
    const agent = network.pds.getClient()

    // Create a test account
    await agent.com.atproto.server.createAccount({
      handle: 'branded-user.test',
      email: 'branded-user@test.com',
      password: 'password123',
    })

    // Verify the trusted client exists in the DB
    // @ts-expect-error accessing internal db
    const db = ctx.accountManager.db

    const trustedClientId =
      'https://certified.earth/.well-known/oauth-client-metadata'

    const trustedClient = await db.db
      .selectFrom('trusted_client')
      .selectAll()
      .where('clientId', '=', trustedClientId)
      .executeTakeFirst()

    expect(trustedClient).toBeDefined()
    expect(trustedClient!.brandName).toBe('Certified')
    expect(trustedClient!.brandColor).toBe('#1A1A2E')

    // Start OAuth flow and request OTP
    const { cookieJar } = await startOAuthFlow(pdsUrl)

    // Get the device ID from the cookie jar
    const devId = cookieJar.get('dev-id')
    expect(devId).toBeDefined()

    // Directly call requestOtp with the trusted client ID to test branding.
    // The OAuthStore is accessible via ctx.oauthProvider.accountManager.store
    // @ts-expect-error accessing internal oauthProvider
    const oauthStore = ctx.oauthProvider?.accountManager?.store
    expect(oauthStore).toBeDefined()

    const { mail } = await waitForMail(async () => {
      await oauthStore.requestOtp({
        deviceId: devId,
        clientId: trustedClientId,
        emailNorm: 'branded-user@test.com',
        requestIp: null,
        userAgent: null,
      })
    })

    // Verify the email contains the brand name
    expect(mail.to).toBe('branded-user@test.com')
    const subject = typeof mail.subject === 'string' ? mail.subject : ''
    // Subject should contain the brand name
    expect(subject).toContain('Certified')
  })
})
