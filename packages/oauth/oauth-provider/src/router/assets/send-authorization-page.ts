import type { IncomingMessage, ServerResponse } from 'node:http'
import { CspValue } from '../../lib/csp/index.js'
import { Customization } from '../../customization/customization.js'
import { AuthorizationResultAuthorizePage } from '../../result/authorization-result-authorize-page.js'
import { SendWebAppOptions, sendWebAppFactory } from './assets.js'

export function sendAuthorizePageFactory(
  customization: Customization,
  options?: SendWebAppOptions,
  frameAncestors?: string[],
) {
  const sendApp = sendWebAppFactory(
    'authorization-page',
    customization,
    options,
  )

  // Build the per-page CSP override if frameAncestors is provided
  const authorizeCsp = frameAncestors?.length
    ? { 'frame-ancestors': frameAncestors as CspValue[] }
    : undefined

  return async function sendAuthorizePage(
    req: IncomingMessage,
    res: ServerResponse,
    data: AuthorizationResultAuthorizePage,
  ): Promise<void> {
    return sendApp(req, res, {
      data: {
        __authorizeData: {
          requestUri: data.requestUri,

          clientId: data.client.id,
          clientMetadata: data.client.metadata,
          clientTrusted: data.client.info.isTrusted,
          clientFirstParty: data.client.info.isFirstParty,
          clientBrandColor: data.client.info.brandColor,

          scope: data.parameters.scope,
          uiLocales: data.parameters.ui_locales,
          loginHint: data.parameters.login_hint,
          promptMode: data.parameters.prompt,
          permissionSets: Object.fromEntries(data.permissionSets),
        },
        __sessions: data.sessions,
      },
      csp: authorizeCsp,
    })
  }
}
