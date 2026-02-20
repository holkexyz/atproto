import type { IncomingMessage, ServerResponse } from 'node:http'
import { CspValue } from '../../lib/csp/index.js'
import { Customization } from '../../customization/customization.js'
import {
  buildErrorPayload,
  buildErrorStatus,
} from '../../errors/error-parser.js'
import { SendWebAppOptions, sendWebAppFactory } from './assets.js'

export function sendErrorPageFactory(
  customization: Customization,
  options?: SendWebAppOptions,
  frameAncestors?: string[],
) {
  const sendApp = sendWebAppFactory('error-page', customization, options)

  // Build the per-page CSP override if frameAncestors is provided
  const errorCsp = frameAncestors?.length
    ? { 'frame-ancestors': frameAncestors as CspValue[] }
    : undefined

  return async function sendErrorPage(
    req: IncomingMessage,
    res: ServerResponse,
    err: unknown,
  ): Promise<void> {
    return sendApp(req, res, {
      status: buildErrorStatus(err),
      data: { __errorData: buildErrorPayload(err) },
      csp: errorCsp,
    })
  }
}
