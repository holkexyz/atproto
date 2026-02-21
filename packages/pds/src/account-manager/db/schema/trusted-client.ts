export interface TrustedClient {
  clientId: string
  brandName: string
  logoUrl: string | null
  brandColor: string | null
  supportEmail: string | null
  createdAt: string
  primaryColor: string | null
  primaryColorContrast: string | null
  lightColor: string | null
  darkColor: string | null
  errorColor: string | null
  warningColor: string | null
  successColor: string | null
}

export const tableName = 'trusted_client'

export type PartialDB = { [tableName]: TrustedClient }
