import { Generated } from 'kysely'

export interface OtpRateLimit {
  id: Generated<number>
  key: string
  createdAt: Generated<string>
}

export const tableName = 'otp_rate_limit'

export type PartialDB = { [tableName]: OtpRateLimit }
