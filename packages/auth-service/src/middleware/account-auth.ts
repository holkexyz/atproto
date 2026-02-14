import type { Request, Response, NextFunction } from 'express'
import type { AuthServiceContext } from '../context.js'

const ACCOUNT_SESSION_COOKIE = 'magic_account_session'

export interface AuthenticatedRequest extends Request {
  accountSession?: {
    sessionId: string
    did: string
    email: string
  }
}

export function accountAuth(ctx: AuthServiceContext) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const sessionId = req.cookies[ACCOUNT_SESSION_COOKIE]
    if (!sessionId) {
      next()
      return
    }

    const session = ctx.db.getAccountSession(sessionId)
    if (!session) {
      res.clearCookie(ACCOUNT_SESSION_COOKIE)
      next()
      return
    }

    req.accountSession = {
      sessionId: session.sessionId,
      did: session.did,
      email: session.email,
    }
    next()
  }
}

export function requireAuth(ctx: AuthServiceContext) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.accountSession) {
      res.redirect(303, '/account/login')
      return
    }
    next()
  }
}

export function setAccountSessionCookie(res: Response, sessionId: string): void {
  res.cookie(ACCOUNT_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  })
}

export function clearAccountSessionCookie(res: Response): void {
  res.clearCookie(ACCOUNT_SESSION_COOKIE)
}
