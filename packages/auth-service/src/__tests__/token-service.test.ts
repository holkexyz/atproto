import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MagicPdsDb } from '@magic-pds/shared'
import { MagicLinkTokenService } from '../magic-link/token.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

let db: MagicPdsDb
let service: MagicLinkTokenService
let dbPath: string

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `magic-pds-token-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
  db = new MagicPdsDb(dbPath)
  service = new MagicLinkTokenService(db, {
    expiryMinutes: 10,
    baseUrl: 'https://auth.example.com/auth/verify',
    maxAttemptsPerToken: 3,
  })
})

afterEach(() => {
  db.close()
  try { fs.unlinkSync(dbPath) } catch {}
  try { fs.unlinkSync(dbPath + '-wal') } catch {}
  try { fs.unlinkSync(dbPath + '-shm') } catch {}
})

describe('MagicLinkTokenService', () => {
  describe('create', () => {
    it('returns a token and csrf', () => {
      const { token, csrf } = service.create({
        email: 'test@example.com',
        authRequestId: 'urn:req:1',
        clientId: null,
        deviceInfo: 'TestBrowser',
      })

      expect(token).toBeDefined()
      expect(csrf).toBeDefined()
      expect(token.length).toBeGreaterThan(20)
      expect(csrf.length).toBeGreaterThan(20)
    })
  })

  describe('buildUrl', () => {
    it('builds a URL with token and csrf params', () => {
      const url = service.buildUrl('my-token', 'my-csrf')
      expect(url).toBe('https://auth.example.com/auth/verify?token=my-token&csrf=my-csrf')
    })
  })

  describe('verify', () => {
    it('verifies a valid token (same device)', () => {
      const { token, csrf } = service.create({
        email: 'user@test.com',
        authRequestId: 'urn:req:2',
        clientId: 'https://app.example/metadata.json',
        deviceInfo: null,
      })

      const result = service.verify(token, csrf)
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        expect(result.email).toBe('user@test.com')
        expect(result.authRequestId).toBe('urn:req:2')
        expect(result.clientId).toBe('https://app.example/metadata.json')
        expect(result.sameDevice).toBe(true)
      }
    })

    it('detects cross-device (different csrf)', () => {
      const { token } = service.create({
        email: 'user@test.com',
        authRequestId: 'urn:req:3',
        clientId: null,
        deviceInfo: null,
      })

      const result = service.verify(token, 'wrong-csrf')
      expect('error' in result).toBe(false)
      if (!('error' in result)) {
        expect(result.sameDevice).toBe(false)
      }
    })

    it('rejects already-used tokens', () => {
      const { token, csrf } = service.create({
        email: 'user@test.com',
        authRequestId: 'urn:req:4',
        clientId: null,
        deviceInfo: null,
      })

      // First use succeeds
      service.verify(token, csrf)

      // Second use fails
      const result = service.verify(token, csrf)
      expect('error' in result).toBe(true)
    })

    it('rejects invalid tokens', () => {
      const result = service.verify('nonexistent-token', undefined)
      expect('error' in result).toBe(true)
    })
  })

  describe('checkStatus', () => {
    it('returns pending for unused tokens', () => {
      const { csrf } = service.create({
        email: 'poll@test.com',
        authRequestId: 'urn:req:5',
        clientId: null,
        deviceInfo: null,
      })

      expect(service.checkStatus(csrf)).toBe('pending')
    })

    it('returns verified after token is used', () => {
      const { token, csrf } = service.create({
        email: 'poll@test.com',
        authRequestId: 'urn:req:6',
        clientId: null,
        deviceInfo: null,
      })

      service.verify(token, csrf)
      expect(service.checkStatus(csrf)).toBe('verified')
    })

    it('returns expired for unknown csrf', () => {
      expect(service.checkStatus('no-such-csrf')).toBe('expired')
    })
  })
})
