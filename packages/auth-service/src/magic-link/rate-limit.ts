import { MagicPdsDb, type RateLimitConfig, DEFAULT_RATE_LIMITS } from '@magic-pds/shared'

const FIFTEEN_MINUTES = 15 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000

export class RateLimiter {
  private limits: RateLimitConfig

  constructor(
    private readonly db: MagicPdsDb,
    limits?: Partial<RateLimitConfig>,
  ) {
    this.limits = { ...DEFAULT_RATE_LIMITS, ...limits }
  }

  /**
   * Check if sending an email to this address from this IP is allowed.
   * Returns null if allowed, or an error message if rate limited.
   */
  check(email: string, ipAddress: string | null): string | null {
    const emailLower = email.toLowerCase()

    // Per-email per 15 min
    const email15 = this.db.getEmailSendCount(emailLower, FIFTEEN_MINUTES)
    if (email15 >= this.limits.emailPer15Min) {
      return 'Too many requests. Please wait before requesting another link.'
    }

    // Per-email per hour
    const emailHour = this.db.getEmailSendCount(emailLower, ONE_HOUR)
    if (emailHour >= this.limits.emailPerHour) {
      return 'Too many requests. Please try again later.'
    }

    // Per-IP per 15 min
    if (ipAddress) {
      const ip15 = this.db.getIpSendCount(ipAddress, FIFTEEN_MINUTES)
      if (ip15 >= this.limits.ipPer15Min) {
        return 'Too many requests from this address. Please wait.'
      }
    }

    return null
  }

  /**
   * Record that an email was sent.
   */
  record(email: string, ipAddress: string | null): void {
    this.db.recordEmailSend(email, ipAddress)
  }
}
