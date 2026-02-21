import { useState } from 'react'
import { useErrorBoundary } from 'react-error-boundary'
import { Account, Api, UnknownRequestUriError } from '../../../lib/api.ts'
import { OtpCodeForm } from './otp-code-form.tsx'
import { OtpEmailForm } from './otp-email-form.tsx'

export interface OtpSignInViewProps {
  api: Api
  loginHint?: string
  autoSubmit?: boolean
  onAuthenticated: (result: {
    account: Account
    ephemeralToken?: string
    consentRequired?: boolean
    remember?: boolean
  }) => void
  onSwitchToExternalProvider: () => void
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function OtpSignInView(props: OtpSignInViewProps) {
  const emailHint =
    props.loginHint && EMAIL_RE.test(props.loginHint)
      ? props.loginHint
      : undefined
  const [step, setStep] = useState<'email' | 'code'>(
    props.autoSubmit && emailHint ? 'code' : 'email',
  )
  const [email, setEmail] = useState(
    props.autoSubmit && emailHint ? emailHint : '',
  )
  const { showBoundary } = useErrorBoundary<UnknownRequestUriError>()

  const handleResend = async () => {
    try {
      await props.api.doOtpRequest(email)
    } catch (error) {
      if (error instanceof UnknownRequestUriError) showBoundary(error)
      throw error
    }
  }

  if (step === 'email') {
    return (
      <OtpEmailForm
        api={props.api}
        loginHint={props.loginHint}
        onCodeSent={(sentEmail) => {
          setEmail(sentEmail)
          setStep('code')
        }}
        onSwitchToExternalProvider={props.onSwitchToExternalProvider}
      />
    )
  }

  return (
    <OtpCodeForm
      api={props.api}
      email={email}
      onVerified={props.onAuthenticated}
      onResend={handleResend}
      onBack={() => setStep('email')}
    />
  )
}
