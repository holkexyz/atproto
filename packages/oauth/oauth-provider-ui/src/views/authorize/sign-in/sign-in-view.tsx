import { Trans, useLingui } from '@lingui/react/macro'
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@atproto/oauth-provider-api'
import {
  LayoutTitlePage,
  LayoutTitlePageProps,
} from '../../../components/layouts/layout-title-page.tsx'
import { Account, Api } from '../../../lib/api.ts'
import { Override } from '../../../lib/util.ts'
import { ExternalProviderForm } from '../external-provider/external-provider-form.tsx'
import { OtpSignInView } from '../otp/otp-sign-in-view.tsx'
import { SignInForm, SignInFormOutput } from './sign-in-form.tsx'
import { SignInPicker } from './sign-in-picker.tsx'

export type SignInViewProps = Override<
  LayoutTitlePageProps,
  {
    api: Api
    sessions: readonly Session[]
    selectSub: (sub: string | null) => void
    loginHint?: string
    autoSubmit?: boolean

    onSignIn: (
      credentials: SignInFormOutput,
      signal: AbortSignal,
    ) => void | PromiseLike<void>
    onAuthenticated?: (result: {
      account: Account
      ephemeralToken?: string
      consentRequired?: boolean
    }) => void
    onSignUp?: () => void
    onForgotPassword?: (emailHint?: string) => void
    onBack?: () => void
    backLabel?: ReactNode
  }
>

export function SignInView({
  api,
  loginHint,
  autoSubmit,
  sessions,
  selectSub,

  onSignIn,
  onAuthenticated,
  onSignUp,
  onForgotPassword,
  onBack,
  backLabel,

  // LayoutTitlePage
  title,
  subtitle,
  ...props
}: SignInViewProps) {
  const { t } = useLingui()
  const session = useMemo(() => sessions.find((s) => s.selected), [sessions])
  const clearSession = useCallback(() => selectSub(null), [selectSub])
  const accounts = useMemo(() => sessions.map((s) => s.account), [sessions])
  const [showSignInForm, setShowSignInForm] = useState(sessions.length === 0)

  // Default to OTP mode when onAuthenticated is provided; otherwise fall back to password
  const [mode, setMode] = useState<'otp' | 'password' | 'external-provider'>(
    onAuthenticated ? 'otp' : 'password',
  )

  title ??= t({ message: 'Sign in', context: 'noun' })

  useEffect(() => {
    // Make sure the "back" action shows the account picker instead of the
    // sign-in form (since the account was added to the list of current
    // sessions).
    if (session) setShowSignInForm(false)
  }, [session])

  if (session) {
    // All set (parent view will handle the redirect)
    if (!session.loginRequired) return null

    return (
      <LayoutTitlePage
        {...props}
        title={title}
        subtitle={subtitle ?? <Trans>Confirm your password to continue</Trans>}
      >
        <SignInForm
          onSubmit={onSignIn}
          onForgotPassword={onForgotPassword}
          onBack={clearSession}
          usernameDefault={
            session.account.preferred_username || session.account.sub
          }
          usernameReadonly={true}
          rememberDefault={true}
        />
      </LayoutTitlePage>
    )
  }

  // External provider mode: show the external provider form
  if (mode === 'external-provider') {
    return (
      <LayoutTitlePage
        {...props}
        title={title}
        subtitle={<Trans>Enter your handle or hosting provider</Trans>}
      >
        <ExternalProviderForm
          onBack={() => setMode(onAuthenticated ? 'otp' : 'password')}
        />
      </LayoutTitlePage>
    )
  }

  // OTP mode: show OTP sign-in view (primary flow when onAuthenticated is provided)
  if (onAuthenticated && mode === 'otp') {
    return (
      <LayoutTitlePage
        {...props}
        title={title}
        subtitle={subtitle ?? <Trans>Enter your email to sign in</Trans>}
      >
        <OtpSignInView
          api={api}
          loginHint={loginHint}
          autoSubmit={autoSubmit}
          onAuthenticated={onAuthenticated}
          onSwitchToExternalProvider={() => setMode('external-provider')}
        />
      </LayoutTitlePage>
    )
  }

  if (loginHint) {
    return (
      <LayoutTitlePage
        {...props}
        title={title}
        subtitle={subtitle ?? <Trans>Enter your password</Trans>}
      >
        <>
          <SignInForm
            onSubmit={onSignIn}
            onForgotPassword={onForgotPassword}
            usernameDefault={loginHint}
            usernameReadonly={true}
          />
          {onAuthenticated && (
            <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={() => setMode('otp')}
              >
                <Trans>Sign in with email code instead</Trans>
              </button>
            </div>
          )}
          <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={() => setMode('external-provider')}
            >
              <Trans>Sign in with ATProto/Bluesky</Trans>
            </button>
          </div>
        </>
      </LayoutTitlePage>
    )
  }

  if (sessions.length === 0) {
    return (
      <LayoutTitlePage
        {...props}
        title={title}
        subtitle={subtitle ?? <Trans>Enter your username and password</Trans>}
      >
        <>
          <SignInForm onSubmit={onSignIn} onForgotPassword={onForgotPassword} />
          {onAuthenticated && (
            <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={() => setMode('otp')}
              >
                <Trans>Sign in with email code instead</Trans>
              </button>
            </div>
          )}
          <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={() => setMode('external-provider')}
            >
              <Trans>Sign in with ATProto/Bluesky</Trans>
            </button>
          </div>
        </>
      </LayoutTitlePage>
    )
  }

  if (showSignInForm) {
    return (
      <LayoutTitlePage
        {...props}
        title={title}
        subtitle={subtitle ?? <Trans>Enter your username and password</Trans>}
      >
        <>
          <SignInForm
            onSubmit={onSignIn}
            onForgotPassword={onForgotPassword}
            onBack={() => setShowSignInForm(false)}
          />
          {onAuthenticated && (
            <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={() => setMode('otp')}
              >
                <Trans>Sign in with email code instead</Trans>
              </button>
            </div>
          )}
          <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            <button
              type="button"
              className="underline hover:no-underline"
              onClick={() => setMode('external-provider')}
            >
              <Trans>Sign in with ATProto/Bluesky</Trans>
            </button>
          </div>
        </>
      </LayoutTitlePage>
    )
  }

  return (
    <LayoutTitlePage
      {...props}
      title={title}
      subtitle={subtitle ?? <Trans>Select from an existing account</Trans>}
    >
      <SignInPicker
        accounts={accounts}
        onAccount={(a) => selectSub(a.sub)}
        onOther={() => setShowSignInForm(true)}
        onBack={onBack}
        backLabel={backLabel}
        onSignUp={onSignUp}
      />
    </LayoutTitlePage>
  )
}
