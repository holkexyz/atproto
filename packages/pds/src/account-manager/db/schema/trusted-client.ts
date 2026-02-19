export interface TrustedClient {
  clientId: string
  brandName: string
  logoUrl: string | null
  brandColor: string | null
  supportEmail: string | null
  createdAt: string
}

export const tableName = 'trusted_client'

export type PartialDB = { [tableName]: TrustedClient }
