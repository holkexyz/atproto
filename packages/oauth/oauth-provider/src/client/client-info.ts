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
   */
  brandColor?: string
}
