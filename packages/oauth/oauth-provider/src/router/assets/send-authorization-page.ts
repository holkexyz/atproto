import type { IncomingMessage, ServerResponse } from 'node:http'
import { CspValue } from '../../lib/csp/index.js'
import { Customization } from '../../customization/customization.js'
import { ClientBranding } from '../../client/client-info.js'
import { cssCode } from '../../lib/html/index.js'
import { AuthorizationResultAuthorizePage } from '../../result/authorization-result-authorize-page.js'
import { SendWebAppOptions, sendWebAppFactory } from './assets.js'

function buildClientBrandingCss(branding?: ClientBranding): string | undefined {
  if (!branding) return undefined
  const vars: string[] = []

  function hexToRgb(hex: string) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
    if (!m) return null
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
  }

  function extractHue({ r, g, b }: { r: number; g: number; b: number }) {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
    if (max === min) return 0
    const d = max - min
    let h = 0
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
    else if (max === gn) h = ((bn - rn) / d + 2) * 60
    else h = ((rn - gn) / d + 4) * 60
    return h
  }

  function luminance({ r, g, b }: { r: number; g: number; b: number }) {
    const f = (c: number) => {
      const s = c / 255
      return s < 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return f(r) * 0.2126 + f(g) * 0.7152 + f(b) * 0.0722
  }

  function contrastRatio(
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number },
  ) {
    const la = luminance(a), lb = luminance(b)
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
  }

  const light = (branding.lightColor ? hexToRgb(branding.lightColor) : null) ?? { r: 255, g: 255, b: 255 }
  const dark = (branding.darkColor ? hexToRgb(branding.darkColor) : null) ?? { r: 0, g: 0, b: 0 }

  const colorMap = [
    { name: 'primary', hex: branding.primaryColor, contrastHex: branding.primaryColorContrast },
    { name: 'error', hex: branding.errorColor, contrastHex: undefined },
    { name: 'warning', hex: branding.warningColor, contrastHex: undefined },
    { name: 'success', hex: branding.successColor, contrastHex: undefined },
  ]

  for (const { name, hex, contrastHex } of colorMap) {
    if (!hex) continue
    const rgb = hexToRgb(hex)
    if (!rgb) continue
    const contrast = contrastHex
      ? (hexToRgb(contrastHex) ?? (contrastRatio(rgb, light) > contrastRatio(rgb, dark) ? light : dark))
      : (contrastRatio(rgb, light) > contrastRatio(rgb, dark) ? light : dark)
    const hue = extractHue(rgb)
    vars.push(`--branding-color-${name}: ${rgb.r} ${rgb.g} ${rgb.b};`)
    vars.push(`--branding-color-${name}-contrast: ${contrast.r} ${contrast.g} ${contrast.b};`)
    vars.push(`--branding-color-${name}-hue: ${hue};`)
  }

  const extra: string[] = []
  if (branding.lightColor) {
    const rgb = hexToRgb(branding.lightColor)
    if (rgb) {
      extra.push(`body { background-color: rgb(${rgb.r} ${rgb.g} ${rgb.b}) !important; }`)
      // If background is dark, use light text
      const lum = luminance(rgb)
      if (lum < 0.2) {
        extra.push(`body { color: rgb(255 255 255) !important; }`)
      }
    }
  }

  if (vars.length === 0 && extra.length === 0) return undefined
  const rootBlock = vars.length > 0 ? `:root { ${vars.join(' ')} }` : ''
  return [rootBlock, ...extra].filter(Boolean).join('\n')
}

export function sendAuthorizePageFactory(
  customization: Customization,
  options?: SendWebAppOptions,
  frameAncestors?: string[],
) {
  // Use SameSite=None for the CSRF cookie when the page can be embedded in
  // cross-origin iframes (frameAncestors has entries beyond just "'self'")
  const csrfSameSite =
    frameAncestors && frameAncestors.length > 1 ? 'none' : undefined

  const sendApp = sendWebAppFactory(
    'authorization-page',
    customization,
    options,
    csrfSameSite,
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
    const clientBrandingCss = cssCode(buildClientBrandingCss(data.client.info.branding))

    return sendApp(req, res, {
      data: {
        __authorizeData: {
          requestUri: data.requestUri,

          clientId: data.client.id,
          clientMetadata: data.client.metadata,
          clientTrusted: data.client.info.isTrusted,
          clientFirstParty: data.client.info.isFirstParty,
          clientBrandColor: data.client.info.brandColor,
          clientBranding: data.client.info.branding,

          scope: data.parameters.scope,
          uiLocales: data.parameters.ui_locales,
          loginHint: data.parameters.login_hint,
          promptMode: data.parameters.prompt,
          permissionSets: Object.fromEntries(data.permissionSets),
        },
        __sessions: data.sessions,
      },
      csp: authorizeCsp,
      styles: clientBrandingCss ? [clientBrandingCss] : undefined,
    })
  }
}
