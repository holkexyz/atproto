import './style.css'

import type { HydrationData } from '#/hydration-data.d.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import { LocaleProvider } from './locales/locale-provider.tsx'
import { AuthorizeView } from './views/authorize/authorize-view.tsx'
import { ErrorView } from './views/error/error-view.tsx'

const {
  __authorizeData: authorizeData,
  __customizationData: customizationData,
  __sessions: initialSessions,
} = window as typeof window & HydrationData['authorization-page']

// ---------------------------------------------------------------------------
// Per-client CSS variable injection
// ---------------------------------------------------------------------------

function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!match) return null
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  }
}

function extractHue({ r, g, b }: { r: number; g: number; b: number }): number {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  if (max === min) return 0
  const d = max - min
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return h
}

function pickContrastColor(
  ref: { r: number; g: number; b: number },
  light: { r: number; g: number; b: number },
  dark: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  function lum({ r, g, b }: { r: number; g: number; b: number }) {
    const ch = (v: number) => {
      const c = v / 255
      return c < 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    }
    return ch(r) * 0.2126 + ch(g) * 0.7152 + ch(b) * 0.0722
  }
  function contrast(
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number },
  ) {
    const aL = lum(a)
    const bL = lum(b)
    const [lighter, darker] = aL > bL ? [aL, bL] : [bL, aL]
    return (lighter + 0.05) / (darker + 0.05)
  }
  return contrast(ref, light) > contrast(ref, dark) ? light : dark
}

;(function injectClientBrandingCss() {
  const branding = authorizeData.clientBranding
  if (!branding) return

  const contrastLight = hexToRgb(branding.lightColor ?? '') ?? {
    r: 255,
    g: 255,
    b: 255,
  }
  const contrastDark = hexToRgb(branding.darkColor ?? '') ?? {
    r: 0,
    g: 0,
    b: 0,
  }

  const colorEntries: Array<{
    name: string
    hexField: string | undefined
    contrastHexField: string | undefined
  }> = [
    {
      name: 'primary',
      hexField: branding.primaryColor,
      contrastHexField: branding.primaryColorContrast,
    },
    {
      name: 'error',
      hexField: branding.errorColor,
      contrastHexField: undefined,
    },
    {
      name: 'warning',
      hexField: branding.warningColor,
      contrastHexField: undefined,
    },
    {
      name: 'success',
      hexField: branding.successColor,
      contrastHexField: undefined,
    },
  ]

  const vars: string[] = []

  for (const { name, hexField, contrastHexField } of colorEntries) {
    if (!hexField) continue
    const rgb = hexToRgb(hexField)
    if (!rgb) continue

    const contrast = contrastHexField
      ? (hexToRgb(contrastHexField) ??
        pickContrastColor(rgb, contrastLight, contrastDark))
      : pickContrastColor(rgb, contrastLight, contrastDark)

    const hue = extractHue(rgb)

    vars.push(`--branding-color-${name}: ${rgb.r} ${rgb.g} ${rgb.b};`)
    vars.push(
      `--branding-color-${name}-contrast: ${contrast.r} ${contrast.g} ${contrast.b};`,
    )
    vars.push(`--branding-color-${name}-hue: ${hue};`)
  }

  const bodyRules: string[] = []
  if (branding.lightColor) {
    const lightRgb = hexToRgb(branding.lightColor)
    if (lightRgb) {
      bodyRules.push(
        `body { background-color: rgb(${lightRgb.r} ${lightRgb.g} ${lightRgb.b}) !important; }`,
      )
    }
  }

  if (vars.length === 0 && bodyRules.length === 0) return

  const style = document.createElement('style')
  style.setAttribute('data-client-branding', '')
  const rootBlock =
    vars.length > 0 ? `:root { ${vars.join(' ')} }` : ''
  style.textContent = [rootBlock, ...bodyRules].filter(Boolean).join('\n')
  document.head.appendChild(style)
})()

// ---------------------------------------------------------------------------

// When the user is logging in, make sure the page URL contains the
// "request_uri" in case the user refreshes the page.
// @TODO Actually do this on the backend through a redirect.
const url = new URL(window.location.href)
if (
  url.pathname === '/oauth/authorize' &&
  !url.searchParams.has('request_uri')
) {
  url.search = ''
  url.searchParams.set('client_id', authorizeData.clientId)
  url.searchParams.set('request_uri', authorizeData.requestUri)
  window.history.replaceState(history.state, '', url.pathname + url.search)
}

const container = document.getElementById('root')!

createRoot(container).render(
  <StrictMode>
    <LocaleProvider userLocales={authorizeData.uiLocales?.split(' ')}>
      <ErrorBoundary
        fallbackRender={({ error }) => (
          <ErrorView error={error} customizationData={customizationData} />
        )}
      >
        <AuthorizeView
          authorizeData={authorizeData}
          customizationData={customizationData}
          initialSessions={initialSessions}
        />
      </ErrorBoundary>
    </LocaleProvider>
  </StrictMode>,
)
