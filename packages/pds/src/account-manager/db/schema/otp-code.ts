import { Generated } from 'kysely'

export interface OtpCode {
  id: Generated<number>
  deviceId: string
  clientId: string
  emailNorm: string
  codeHash: string
  salt: string
  attempts: Generated<number>
  maxAttempts: Generated<number>
  expiresAt: string
  createdAt: Generated<string>
  requestIp: string | null
  uaHash: string | null
}

export const tableName = 'otp_code'

export type PartialDB = { [tableName]: OtpCode }
