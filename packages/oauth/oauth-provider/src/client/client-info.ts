export type ClientBranding = {
  /** Primary color hex (buttons, links, focus rings). e.g. '#21201f' */
  primaryColor?: string
  /** Contrast color for text on primary-colored backgrounds. e.g. '#ffffff' */
  primaryColorContrast?: string
  /** Light reference color (page background in light mode). e.g. '#f2ece4' */
  lightColor?: string
  /** Dark reference color (page background in dark mode). e.g. '#1a1a1a' */
  darkColor?: string
  /** Error color hex. e.g. '#E74C3C' */
  errorColor?: string
  /** Warning color hex. e.g. '#F5A623' */
  warningColor?: string
  /** Success color hex. e.g. '#2ECC71' */
  successColor?: string
}

export type ClientInfo = {
  /**
   * Defaults to `false`
   */
  isFirstParty: boolean

  /**
   * Defaults to `true` if the client is isFirstParty, or if the client was
   * loaded from the store. (i.e. false in case of "loopback" & "discoverable"
   * clients)
   */
  isTrusted: boolean

  /**
   * Optional hex color string for branding (e.g. "#1A1A2E").
   * Only set for trusted first-party clients.
   * @deprecated Use branding.primaryColor instead
   */
  brandColor?: string

  /**
   * Per-client branding overrides. When set, these override the global PDS
   * branding CSS variables.
   */
  branding?: ClientBranding
}
