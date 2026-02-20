import { Trans, useLingui } from '@lingui/react/macro'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../../components/forms/button.tsx'
import { Fieldset } from '../../../components/forms/fieldset.tsx'
import { FormCardAsync } from '../../../components/forms/form-card-async.tsx'
import { InputCheckbox } from '../../../components/forms/input-checkbox.tsx'
import { InputText } from '../../../components/forms/input-text.tsx'
import { Account, Api } from '../../../lib/api.ts'

const RESEND_COOLDOWN_SECONDS = 60

export interface OtpCodeFormProps {
  api: Api
  email: string
  brandColor?: string
  onVerified: (result: {
    account: Account
    ephemeralToken?: string
    consentRequired?: boolean
    accountCreated?: boolean
    remember?: boolean
  }) => void
  onResend: () => void | Promise<void>
  onBack?: () => void
}

export function OtpCodeForm({
  api,
  email,
  brandColor,
  onVerified,
  onResend,
  onBack,
}: OtpCodeFormProps) {
  const { t } = useLingui()
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const [resending, setResending] = useState(false)

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const doSubmit = useCallback(
    async (_signal: AbortSignal) => {
      const result = await api.doOtpVerify(email, code)
      onVerified({ ...result, remember })
    },
    [api, email, code, remember, onVerified],
  )

  const doResend = useCallback(async () => {
    if (cooldown > 0 || resending) return
    setResending(true)
    try {
      await onResend()
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (error) {
      // Let UnknownRequestUriError propagate to parent's error boundary
      throw error
    } finally {
      setResending(false)
    }
  }, [cooldown, resending, onResend])

  return (
    <FormCardAsync
      onSubmit={doSubmit}
      invalid={code.length !== 6}
      submitLabel={<Trans>Verify</Trans>}
      submitStyle={
        brandColor
          ? { backgroundColor: brandColor, borderColor: brandColor }
          : undefined
      }
      onCancel={onBack}
      cancelLabel={<Trans>Back</Trans>}
      append={
        <div className="text-center text-sm text-slate-600 dark:text-slate-400">
          {cooldown > 0 ? (
            <Trans>Resend available in {cooldown}s</Trans>
          ) : (
            <Button type="button" onClick={doResend} disabled={resending}>
              <Trans>Didn&apos;t get it? Resend</Trans>
            </Button>
          )}
        </div>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">
        <Trans>Sent to {email}</Trans>
      </p>

      <Fieldset label={<Trans>6-digit code</Trans>}>
        <InputText
          name="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          minLength={6}
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          dir="ltr"
          autoFocus
          required
          title={t`6-digit code`}
          value={code}
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6)
            setCode(val)
          }}
        />
      </Fieldset>

      <InputCheckbox
        name="remember"
        title={t`Remember this account on this device`}
        checked={remember}
        onChange={(event) => setRemember(event.target.checked)}
      >
        <Trans>Remember this account on this device</Trans>
      </InputCheckbox>
    </FormCardAsync>
  )
}
