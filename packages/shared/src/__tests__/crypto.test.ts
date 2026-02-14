import { describe, it, expect } from 'vitest'
import {
  generateMagicLinkToken,
  hashToken,
  timingSafeEqual,
  generateCsrfToken,
  generateRandomHandle,
} from '../crypto.js'

describe('generateMagicLinkToken', () => {
  it('returns a token and its hash', () => {
    const { token, tokenHash } = generateMagicLinkToken()
    expect(token).toBeDefined()
    expect(tokenHash).toBeDefined()
    expect(token).not.toBe(tokenHash)
  })

  it('generates unique tokens each time', () => {
    const a = generateMagicLinkToken()
    const b = generateMagicLinkToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })

  it('hash matches when computed independently', () => {
    const { token, tokenHash } = generateMagicLinkToken()
    expect(hashToken(token)).toBe(tokenHash)
  })
})

describe('hashToken', () => {
  it('produces consistent SHA-256 hex hashes', () => {
    const hash1 = hashToken('test-token')
    const hash2 = hashToken('test-token')
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // SHA-256 hex = 64 chars
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'))
  })
})

describe('timingSafeEqual', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeEqual('hello', 'hello')).toBe(true)
  })

  it('returns false for different strings', () => {
    expect(timingSafeEqual('hello', 'world')).toBe(false)
  })

  it('returns false for different lengths', () => {
    expect(timingSafeEqual('short', 'longer-string')).toBe(false)
  })
})

describe('generateCsrfToken', () => {
  it('returns a hex string', () => {
    const token = generateCsrfToken()
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('generates unique tokens', () => {
    const a = generateCsrfToken()
    const b = generateCsrfToken()
    expect(a).not.toBe(b)
  })
})

describe('generateRandomHandle', () => {
  it('returns a handle with the given domain', () => {
    const handle = generateRandomHandle('example.com')
    expect(handle).toMatch(/^[a-z0-9]+\.example\.com$/)
  })

  it('generates different handles each time', () => {
    const a = generateRandomHandle('test.com')
    const b = generateRandomHandle('test.com')
    expect(a).not.toBe(b)
  })
})
