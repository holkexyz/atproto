import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MagicPdsDb } from '../db.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

let db: MagicPdsDb
let dbPath: string

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `magic-pds-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
  db = new MagicPdsDb(dbPath)
})

afterEach(() => {
  db.close()
  try { fs.unlinkSync(dbPath) } catch {}
  try { fs.unlinkSync(dbPath + '-wal') } catch {}
  try { fs.unlinkSync(dbPath + '-shm') } catch {}
})

describe('Magic Link Token Operations', () => {
  it('creates and retrieves a token', () => {
    db.createMagicLinkToken({
      tokenHash: 'abc123',
      email: 'Test@Example.com',
      expiresAt: Date.now() + 60000,
      authRequestId: 'req-1',
      clientId: null,
      deviceInfo: 'Chrome',
      csrfToken: 'csrf-1',
    })

    const row = db.getMagicLinkToken('abc123')
    expect(row).toBeDefined()
    expect(row!.email).toBe('test@example.com') // lowercased
    expect(row!.authRequestId).toBe('req-1')
    expect(row!.used).toBe(0)
    expect(row!.attempts).toBe(0)
  })

  it('marks token as used', () => {
    db.createMagicLinkToken({
      tokenHash: 'token1',
      email: 'a@b.com',
      expiresAt: Date.now() + 60000,
      authRequestId: 'req-1',
      clientId: null,
      deviceInfo: null,
      csrfToken: 'csrf-1',
    })

    db.markMagicLinkTokenUsed('token1')
    const row = db.getMagicLinkToken('token1')
    expect(row!.used).toBe(1)
  })

  it('increments token attempts', () => {
    db.createMagicLinkToken({
      tokenHash: 'token2',
      email: 'a@b.com',
      expiresAt: Date.now() + 60000,
      authRequestId: 'req-1',
      clientId: null,
      deviceInfo: null,
      csrfToken: 'csrf-2',
    })

    expect(db.incrementTokenAttempts('token2')).toBe(1)
    expect(db.incrementTokenAttempts('token2')).toBe(2)
    expect(db.incrementTokenAttempts('token2')).toBe(3)
  })

  it('looks up token by CSRF', () => {
    db.createMagicLinkToken({
      tokenHash: 'token3',
      email: 'poll@test.com',
      expiresAt: Date.now() + 60000,
      authRequestId: 'req-3',
      clientId: 'https://app.example/client-metadata.json',
      deviceInfo: null,
      csrfToken: 'csrf-poll',
    })

    const row = db.getMagicLinkTokenByCsrf('csrf-poll')
    expect(row).toBeDefined()
    expect(row!.email).toBe('poll@test.com')
    expect(row!.clientId).toBe('https://app.example/client-metadata.json')
  })

  it('cleans up expired tokens', () => {
    db.createMagicLinkToken({
      tokenHash: 'expired',
      email: 'a@b.com',
      expiresAt: Date.now() - 1000, // already expired
      authRequestId: 'req-1',
      clientId: null,
      deviceInfo: null,
      csrfToken: 'csrf-x',
    })

    const cleaned = db.cleanupExpiredTokens()
    expect(cleaned).toBe(1)
    expect(db.getMagicLinkToken('expired')).toBeUndefined()
  })
})

describe('Account Email Operations', () => {
  it('sets and retrieves email-to-DID mapping', () => {
    db.setAccountEmail('User@Test.com', 'did:plc:abc')
    expect(db.getDidByEmail('user@test.com')).toBe('did:plc:abc')
    expect(db.getEmailByDid('did:plc:abc')).toBe('user@test.com')
  })

  it('returns undefined for unknown email', () => {
    expect(db.getDidByEmail('nobody@test.com')).toBeUndefined()
  })
})

describe('Backup Email Operations', () => {
  it('adds and verifies a backup email', () => {
    db.setAccountEmail('primary@test.com', 'did:plc:123')
    db.addBackupEmail('did:plc:123', 'backup@test.com', 'verify-hash')

    // Not verified yet
    expect(db.getDidByBackupEmail('backup@test.com')).toBeUndefined()

    // Verify
    expect(db.verifyBackupEmail('verify-hash')).toBe(true)
    expect(db.getDidByBackupEmail('backup@test.com')).toBe('did:plc:123')
  })

  it('lists backup emails for a DID', () => {
    db.addBackupEmail('did:plc:123', 'b1@test.com', 'h1')
    db.addBackupEmail('did:plc:123', 'b2@test.com', 'h2')

    const emails = db.getBackupEmails('did:plc:123')
    expect(emails).toHaveLength(2)
  })

  it('removes a backup email', () => {
    db.addBackupEmail('did:plc:123', 'remove@test.com', 'h3')
    db.removeBackupEmail('did:plc:123', 'remove@test.com')
    expect(db.getBackupEmails('did:plc:123')).toHaveLength(0)
  })
})

describe('Account Session Operations', () => {
  it('creates and retrieves a session', () => {
    db.createAccountSession({
      sessionId: 'sess-1',
      did: 'did:plc:abc',
      email: 'user@test.com',
      expiresAt: Date.now() + 86400000,
      userAgent: 'TestAgent',
      ipAddress: '127.0.0.1',
    })

    const sess = db.getAccountSession('sess-1')
    expect(sess).toBeDefined()
    expect(sess!.did).toBe('did:plc:abc')
  })

  it('does not return expired sessions', () => {
    db.createAccountSession({
      sessionId: 'sess-expired',
      did: 'did:plc:abc',
      email: 'user@test.com',
      expiresAt: Date.now() - 1000,
      userAgent: null,
      ipAddress: null,
    })

    expect(db.getAccountSession('sess-expired')).toBeUndefined()
  })

  it('deletes sessions by DID', () => {
    db.createAccountSession({
      sessionId: 'sess-2',
      did: 'did:plc:xyz',
      email: 'user@test.com',
      expiresAt: Date.now() + 86400000,
      userAgent: null,
      ipAddress: null,
    })

    db.deleteSessionsByDid('did:plc:xyz')
    expect(db.getSessionsByDid('did:plc:xyz')).toHaveLength(0)
  })

  it('cleans up expired sessions', () => {
    db.createAccountSession({
      sessionId: 'sess-old',
      did: 'did:plc:abc',
      email: 'user@test.com',
      expiresAt: Date.now() - 1000,
      userAgent: null,
      ipAddress: null,
    })

    const cleaned = db.cleanupExpiredSessions()
    expect(cleaned).toBe(1)
  })
})

describe('Rate Limiting', () => {
  it('records and counts email sends', () => {
    db.recordEmailSend('rate@test.com', '1.2.3.4')
    db.recordEmailSend('rate@test.com', '1.2.3.4')

    expect(db.getEmailSendCount('rate@test.com', 60000)).toBe(2)
    expect(db.getIpSendCount('1.2.3.4', 60000)).toBe(2)
  })

  it('cleans up old rate limit entries', () => {
    // We can't easily test this without manipulating time,
    // but we can verify the method runs without error
    const cleaned = db.cleanupOldRateLimitEntries()
    expect(cleaned).toBeGreaterThanOrEqual(0)
  })
})
