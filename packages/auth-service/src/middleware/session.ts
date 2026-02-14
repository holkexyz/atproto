import type { Request, Response, NextFunction } from 'express'
import * as crypto from 'node:crypto'

const SESSION_COOKIE = 'magic_session'

/**
 * Simple session middleware that sets a session cookie for same-device detection.
 * The session ID is stored in the cookie and passed along with the magic link CSRF.
 */
export function sessionMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.cookies[SESSION_COOKIE]) {
      // Will be set after magic link is sent
    }
    next()
  }
}

export function setSessionCookie(res: Response, csrfToken: string): void {
  res.cookie(SESSION_COOKIE, csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    maxAge: 30 * 60 * 1000, // 30 minutes
  })
}

export function getSessionCsrf(req: Request): string | undefined {
  return req.cookies[SESSION_COOKIE] as string | undefined
}
