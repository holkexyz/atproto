import {
  MagicPdsDb,
  generateMagicLinkToken,
  hashToken,
  timingSafeEqual,
  generateCsrfToken,
  type MagicLinkConfig,
} from '@magic-pds/shared'

export interface SendMagicLinkResult {
  csrf: string
  pollUrl: string
}

export interface VerifyResult {
  email: string
  authRequestId: string
  clientId: string | null
  sameDevice: boolean
}

export class MagicLinkTokenService {
  constructor(
    private readonly db: MagicPdsDb,
    private readonly config: MagicLinkConfig,
  ) {}

  /**
   * Create a magic link token, store its hash in the DB, return raw token + csrf.
   */
  create(data: {
    email: string
    authRequestId: string
    clientId: string | null
    deviceInfo: string | null
  }): { token: string; csrf: string } {
    const { token, tokenHash } = generateMagicLinkToken()
    const csrf = generateCsrfToken()
    const expiresAt = Date.now() + this.config.expiryMinutes * 60 * 1000

    this.db.createMagicLinkToken({
      tokenHash,
      email: data.email.toLowerCase(),
      expiresAt,
      authRequestId: data.authRequestId,
      clientId: data.clientId,
      deviceInfo: data.deviceInfo,
      csrfToken: csrf,
    })

    return { token, csrf }
  }

  /**
   * Build the magic link URL to send in the email.
   */
  buildUrl(token: string, csrf: string): string {
    const url = new URL(this.config.baseUrl)
    url.searchParams.set('token', token)
    url.searchParams.set('csrf', csrf)
    return url.toString()
  }

  /**
   * Verify a magic link token. Returns the associated email and auth request,
   * plus whether this is the same device that requested the link.
   */
  verify(token: string, sessionCsrf: string | undefined): VerifyResult | { error: string } {
    const tokenHash = hashToken(token)
    const row = this.db.getMagicLinkToken(tokenHash)

    if (!row) {
      return { error: 'Invalid or expired link.' }
    }

    if (row.used) {
      return { error: 'This link has already been used.' }
    }

    if (row.expiresAt < Date.now()) {
      return { error: 'This link has expired. Please request a new one.' }
    }

    // Increment attempts and check limit
    const attempts = this.db.incrementTokenAttempts(tokenHash)
    if (attempts > this.config.maxAttemptsPerToken) {
      this.db.markMagicLinkTokenUsed(tokenHash)
      return { error: 'Too many verification attempts. Please request a new link.' }
    }

    // Mark as used (single-use)
    this.db.markMagicLinkTokenUsed(tokenHash)

    // Determine same-device by comparing CSRF from the session cookie
    const sameDevice = sessionCsrf != null && timingSafeEqual(row.csrfToken, sessionCsrf)

    return {
      email: row.email,
      authRequestId: row.authRequestId,
      clientId: row.clientId,
      sameDevice,
    }
  }

  /**
   * Check if a magic link token associated with a CSRF has been verified.
   * Used by the polling endpoint.
   */
  checkStatus(csrf: string): 'pending' | 'verified' | 'expired' {
    const row = this.db.getMagicLinkTokenByCsrf(csrf)

    if (!row) return 'expired'
    if (row.expiresAt < Date.now()) return 'expired'
    if (row.used) return 'verified'
    return 'pending'
  }

  /**
   * Cleanup expired tokens (call periodically).
   */
  cleanup(): number {
    return this.db.cleanupExpiredTokens()
  }
}
