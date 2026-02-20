import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { useErrorBoundary } from 'react-error-boundary'
import { Fieldset } from '../../../components/forms/fieldset.tsx'
import { FormCardAsync } from '../../../components/forms/form-card-async.tsx'
import { InputEmailAddress } from '../../../components/forms/input-email-address.tsx'
import { Api, UnknownRequestUriError } from '../../../lib/api.ts'

export interface OtpEmailFormProps {
  api: Api
  loginHint?: string
  brandColor?: string
  onCodeSent: (email: string) => void
  onSwitchToPassword: () => void
}

export function OtpEmailForm({
  api,
  loginHint,
  brandColor,
  onCodeSent,
  onSwitchToPassword,
}: OtpEmailFormProps) {
  const [email, setEmail] = useState<string | undefined>(loginHint)
  const { showBoundary } = useErrorBoundary<UnknownRequestUriError>()

  const doSubmit = async (signal: AbortSignal) => {
    if (!email) return
    try {
      await api.doOtpRequest(email)
      onCodeSent(email)
    } catch (error) {
      if (error instanceof UnknownRequestUriError) showBoundary(error)
      throw error
    }
  }

  return (
    <>
      <FormCardAsync
        onSubmit={doSubmit}
        invalid={!email}
        submitLabel={<Trans>Continue</Trans>}
        submitStyle={
          brandColor
            ? { backgroundColor: brandColor, borderColor: brandColor }
            : undefined
        }
      >
        <Fieldset label={<Trans>Email address</Trans>}>
          <InputEmailAddress
            name="email"
            defaultValue={loginHint}
            required
            autoFocus={!loginHint}
            readOnly={!!loginHint}
            disabled={!!loginHint}
            onEmail={setEmail}
          />
        </Fieldset>
      </FormCardAsync>
      <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
        <button
          type="button"
          className="underline hover:no-underline"
          onClick={onSwitchToPassword}
        >
          <Trans>Sign in with password</Trans>
        </button>
      </div>
    </>
  )
}
