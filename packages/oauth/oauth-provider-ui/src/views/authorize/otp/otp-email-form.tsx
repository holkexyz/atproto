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
  onCodeSent: (email: string) => void
  onSwitchToExternalProvider: () => void
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function OtpEmailForm({
  api,
  loginHint,
  onCodeSent,
  onSwitchToExternalProvider,
}: OtpEmailFormProps) {
  const emailHint =
    loginHint && EMAIL_RE.test(loginHint) ? loginHint : undefined
  const [email, setEmail] = useState<string | undefined>(emailHint)
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
      >
        <Fieldset label={<Trans>Email address</Trans>}>
          <InputEmailAddress
            name="email"
            defaultValue={emailHint}
            required
            autoFocus={!emailHint}
            readOnly={!!emailHint}
            disabled={!!emailHint}
            onEmail={setEmail}
          />
        </Fieldset>
      </FormCardAsync>
      <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
        <button
          type="button"
          className="underline hover:no-underline"
          onClick={onSwitchToExternalProvider}
        >
          <Trans>Sign in with ATProto/Bluesky</Trans>
        </button>
      </div>
    </>
  )
}
