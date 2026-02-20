import type { IncomingMessage, ServerResponse } from 'node:http'
import createHttpError from 'http-errors'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@atproto/oauth-provider-api'
import {
  CookieSerializeOptions,
  getCookie,
  setCookie,
} from '../../lib/http/index.js'
import { randomHexId } from '../../lib/util/crypto.js'

const TOKEN_BYTE_LENGTH = 12
const TOKEN_LENGTH = TOKEN_BYTE_LENGTH * 2 // 2 hex chars per byte

// @NOTE Cookie based CSRF protection is redundant with session cookies using
// `SameSite` and could probably be removed in the future.
const CSRF_COOKIE_OPTIONS: Readonly<CookieSerializeOptions> = {
  expires: undefined, // "session" cookie
  secure: true,
  httpOnly: false, // Need to be accessible from JavaScript
  sameSite: 'lax',
  path: `/`,
}

export type CsrfOptions = { sameSite?: 'lax' | 'none' }

async function generateCsrfToken() {
  return randomHexId(TOKEN_BYTE_LENGTH)
}

function buildCsrfCookieOptions(
  options?: CsrfOptions,
): Readonly<CookieSerializeOptions> {
  if (options?.sameSite === 'none') {
    return { ...CSRF_COOKIE_OPTIONS, sameSite: 'none', partitioned: true }
  }
  return CSRF_COOKIE_OPTIONS
}

export async function setupCsrfToken(
  req: IncomingMessage,
  res: ServerResponse,
  options?: CsrfOptions,
): Promise<void> {
  const token = getCookieCsrf(req) || (await generateCsrfToken())

  // Refresh cookie (See Chrome's "Lax+POST" behavior)
  setCookie(res, CSRF_COOKIE_NAME, token, buildCsrfCookieOptions(options))
}

export async function validateCsrfToken(
  req: IncomingMessage,
  res: ServerResponse,
  options?: CsrfOptions,
) {
  const cookieValue = getCookieCsrf(req)
  const headerValue = getHeadersCsrf(req)

  // Refresh cookie (See Chrome's "Lax+POST" behavior), or set a new one,
  // allowing clients to retry with the new token.
  setCookie(
    res,
    CSRF_COOKIE_NAME,
    cookieValue || (await generateCsrfToken()),
    buildCsrfCookieOptions(options),
  )

  if (!headerValue) {
    throw createHttpError(400, `Missing CSRF header`)
  }
  if (!cookieValue) {
    throw createHttpError(400, `Missing CSRF cookie`)
  }
  if (cookieValue !== headerValue) {
    throw createHttpError(400, `CSRF mismatch`)
  }
}

export function getCookieCsrf(req: IncomingMessage) {
  const cookieValue = getCookie(req, CSRF_COOKIE_NAME)
  if (cookieValue?.length === TOKEN_LENGTH) {
    return cookieValue
  }
  return undefined
}

export function getHeadersCsrf(req: IncomingMessage) {
  const headerValue = req.headers[CSRF_HEADER_NAME]
  if (typeof headerValue === 'string' && headerValue.length === TOKEN_LENGTH) {
    return headerValue
  }
  return undefined
}
