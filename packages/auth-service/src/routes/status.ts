import { Router, type Request, type Response } from 'express'
import type { AuthServiceContext } from '../context.js'

/**
 * GET /auth/status?csrf=...
 *
 * Polling endpoint for same-device detection.
 * Returns { status: "pending" | "verified" | "expired", redirect?: string }
 */
export function createStatusRouter(ctx: AuthServiceContext): Router {
  const router = Router()

  router.get('/auth/status', (req: Request, res: Response) => {
    const csrf = req.query.csrf as string | undefined

    if (!csrf) {
      res.json({ status: 'expired' })
      return
    }

    const status = ctx.tokenService.checkStatus(csrf)

    if (status === 'verified') {
      const row = ctx.db.getMagicLinkTokenByCsrf(csrf)

      if (row) {
        let did = ctx.db.getDidByEmail(row.email)
        if (!did) {
          did = ctx.db.getDidByBackupEmail(row.email)
        }
        const isNew = !did
        const clientIdParam = row.clientId ? '&client_id=' + encodeURIComponent(row.clientId) : ''
        const redirect = `/auth/consent?request_uri=${encodeURIComponent(row.authRequestId)}&email=${encodeURIComponent(row.email)}&new=${isNew ? '1' : '0'}${clientIdParam}`
        res.json({ status: 'verified', redirect })
        return
      }
    }

    res.json({ status })
  })

  return router
}
