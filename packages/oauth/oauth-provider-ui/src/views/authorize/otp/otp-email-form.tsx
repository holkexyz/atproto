import { Trans } from '@lingui/react/macro'
import { useState } from 'react'
import { Button } from '../../../components/forms/button.tsx'
import { Fieldset } from '../../../components/forms/fieldset.tsx'
import { FormCardAsync } from '../../../components/forms/form-card-async.tsx'
import { InputEmailAddress } from '../../../components/forms/input-email-address.tsx'
import { Api } from '../../../lib/api.ts'

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

  const doSubmit = async (signal: AbortSignal) => {
    if (!email) return
    await api.doOtpRequest(email)
    onCodeSent(email)
  }

  return (
    <FormCardAsync
      onSubmit={doSubmit}
      invalid={!email}
      submitLabel={<Trans>Send me a code</Trans>}
      submitStyle={
        brandColor
          ? { backgroundColor: brandColor, borderColor: brandColor }
          : undefined
      }
      append={
        <div className="text-center text-sm text-slate-600 dark:text-slate-400">
          <Button type="button" onClick={onSwitchToPassword}>
            <Trans>Sign in with password</Trans>
          </Button>
        </div>
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
  )
}
