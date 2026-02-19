import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto'
import { sql } from 'kysely'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AccountDb } from '../db/index.js'

// ---------------------------------------------------------------------------
// OTP Generation and Verification
// ---------------------------------------------------------------------------

export function generateOtp(): {
  code: string
  salt: string
  codeHash: string
} {
  const code = randomInt(100000, 1000000).toString()
  const salt = randomBytes(16).toString('hex')
  const codeHash = createHash('sha256')
    .update(salt + code)
    .digest('hex')
  return { code, salt, codeHash }
}

export function verifyOtp(
  inputCode: string,
  storedHash: string,
  storedSalt: string,
): boolean {
  const inputHash = createHash('sha256')
    .update(storedSalt + inputCode)
    .digest('hex')
  return timingSafeEqual(
    Buffer.from(inputHash, 'hex'),
    Buffer.from(storedHash, 'hex'),
  )
}

// ---------------------------------------------------------------------------
// Email Normalization
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// User-Agent Hashing
// ---------------------------------------------------------------------------

export function hashUserAgent(ua: string | undefined): string | null {
  if (!ua) return null
  return createHash('sha256').update(ua).digest('hex')
}

// ---------------------------------------------------------------------------
// Database Helpers
// ---------------------------------------------------------------------------

// Get a trusted client by clientId
export async function getTrustedClient(db: AccountDb, clientId: string) {
  return db.db
    .selectFrom('trusted_client')
    .selectAll()
    .where('clientId', '=', clientId)
    .executeTakeFirst()
}

// Insert a new OTP code (delete any existing for this deviceId first)
export async function insertOtpCode(
  db: AccountDb,
  params: {
    deviceId: string
    clientId: string
    emailNorm: string
    codeHash: string
    salt: string
    expiresAt: string // ISO 8601 string
    requestIp: string | null
    uaHash: string | null
  },
) {
  await db.db
    .deleteFrom('otp_code')
    .where('deviceId', '=', params.deviceId)
    .execute()
  await db.db.insertInto('otp_code').values(params).execute()
}

// Get the active OTP code for a device + email combo
export async function getOtpCode(
  db: AccountDb,
  params: { deviceId: string; emailNorm: string },
) {
  return db.db
    .selectFrom('otp_code')
    .selectAll()
    .where('deviceId', '=', params.deviceId)
    .where('emailNorm', '=', params.emailNorm)
    .executeTakeFirst()
}

// Increment attempt count
export async function incrementOtpAttempts(db: AccountDb, id: number) {
  await db.db
    .updateTable('otp_code')
    .set({ attempts: sql`attempts + 1` })
    .where('id', '=', id)
    .execute()
}

// Mark OTP as used and delete it
export async function consumeOtpCode(db: AccountDb, id: number) {
  await db.db.deleteFrom('otp_code').where('id', '=', id).execute()
}

// Delete expired OTP codes (for cleanup)
export async function deleteExpiredOtpCodes(db: AccountDb) {
  await db.db
    .deleteFrom('otp_code')
    .where('expiresAt', '<', new Date().toISOString())
    .execute()
}

// ---------------------------------------------------------------------------
// OTP Rate Limiting (SQLite-backed)
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  db: AccountDb,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<void> {
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  const result = await db.db
    .selectFrom('otp_rate_limit')
    .select(db.db.fn.count<number>('id').as('count'))
    .where('key', '=', key)
    .where('createdAt', '>', windowStart)
    .executeTakeFirst()

  if (result && result.count >= maxRequests) {
    throw new InvalidRequestError('Too many requests, please try again later')
  }
}

export async function recordRateLimitHit(
  db: AccountDb,
  key: string,
): Promise<void> {
  await db.db
    .insertInto('otp_rate_limit')
    .values({ key, createdAt: new Date().toISOString() })
    .execute()
}

export async function cleanupRateLimits(db: AccountDb): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  await db.db
    .deleteFrom('otp_rate_limit')
    .where('createdAt', '<', cutoff)
    .execute()
}
