import { useState } from 'react'
import { Account, Api } from '../../../lib/api.ts'
import { OtpCodeForm } from './otp-code-form.tsx'
import { OtpEmailForm } from './otp-email-form.tsx'

export interface OtpSignInViewProps {
  api: Api
  loginHint?: string
  brandColor?: string
  onAuthenticated: (result: {
    account: Account
    ephemeralToken?: string
    consentRequired?: boolean
  }) => void
  onSwitchToPassword: () => void
}

export function OtpSignInView(props: OtpSignInViewProps) {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')

  if (step === 'email') {
    return (
      <OtpEmailForm
        api={props.api}
        loginHint={props.loginHint}
        brandColor={props.brandColor}
        onCodeSent={(sentEmail) => {
          setEmail(sentEmail)
          setStep('code')
        }}
        onSwitchToPassword={props.onSwitchToPassword}
      />
    )
  }

  return (
    <OtpCodeForm
      api={props.api}
      email={email}
      brandColor={props.brandColor}
      onVerified={props.onAuthenticated}
      onResend={() => props.api.doOtpRequest(email)}
    />
  )
}
