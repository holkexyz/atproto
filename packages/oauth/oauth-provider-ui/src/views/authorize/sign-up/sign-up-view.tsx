import { Trans, useLingui } from '@lingui/react/macro'
import HCaptcha from '@hcaptcha/react-hcaptcha'
import { ReactNode, useCallback, useRef, useState } from 'react'
import type { CustomizationData } from '@atproto/oauth-provider-api'
import { Fieldset } from '../../../components/forms/fieldset.tsx'
import { FormCardAsync } from '../../../components/forms/form-card-async.tsx'
import { InputEmailAddress } from '../../../components/forms/input-email-address.tsx'
import { InputText } from '../../../components/forms/input-text.tsx'
import {
  LayoutTitlePage,
  LayoutTitlePageProps,
} from '../../../components/layouts/layout-title-page.tsx'
import { TokenIcon } from '../../../components/utils/icons.tsx'
import { HelpCard } from '../../../components/utils/help-card.tsx'
import { useBrowserColorScheme } from '../../../hooks/use-browser-color-scheme.ts'
import { Override } from '../../../lib/util.ts'
import { SignUpDisclaimer } from './sign-up-disclaimer.tsx'

export type SignUpViewProps = Override<
  LayoutTitlePageProps,
  {
    customizationData?: CustomizationData

    onBack?: () => void
    backLabel?: ReactNode
    onDone: (
      data: {
        email: string
        inviteCode?: string
        hcaptchaToken?: string
      },
      signal?: AbortSignal,
    ) => void | PromiseLike<void>
  }
>

export function SignUpView({
  customizationData: {
    hcaptchaSiteKey = undefined,
    inviteCodeRequired = true,
    links,
  } = {},

  onDone,
  onBack,
  backLabel,

  // LayoutTitlePage
  title,
  subtitle,
  ...props
}: SignUpViewProps) {
  const { t } = useLingui()
  const theme = useBrowserColorScheme()
  const captchaRef = useRef<HCaptcha>(null)

  const [email, setEmail] = useState<string | undefined>(undefined)
  const [inviteCode, setInviteCode] = useState<string | undefined>(undefined)
  const [hcaptchaToken, setHcaptchaToken] = useState<string | undefined>(
    undefined,
  )

  const onHcaptchaLoad = useCallback(() => {
    captchaRef.current?.execute()
  }, [])

  const onHcaptchaVerify = useCallback((token: string) => {
    setHcaptchaToken(token)
  }, [])

  const isValid =
    email &&
    (!inviteCodeRequired || inviteCode) &&
    (hcaptchaSiteKey == null || hcaptchaToken)

  const doSubmit = useCallback(
    (signal: AbortSignal) => {
      if (isValid) {
        return onDone(
          {
            email,
            inviteCode: inviteCodeRequired ? inviteCode : undefined,
            hcaptchaToken,
          },
          signal,
        )
      } else if (hcaptchaSiteKey && !hcaptchaToken && captchaRef.current) {
        captchaRef.current.execute()
      }
    },
    [
      isValid,
      email,
      inviteCode,
      inviteCodeRequired,
      hcaptchaToken,
      hcaptchaSiteKey,
      onDone,
    ],
  )

  return (
    <LayoutTitlePage
      {...props}
      title={title ?? t`Sign up`}
      subtitle={subtitle ?? <Trans>Enter your email to get started</Trans>}
    >
      <FormCardAsync
        className="grow"
        invalid={!isValid}
        onCancel={onBack}
        cancelLabel={backLabel}
        onSubmit={doSubmit}
        submitLabel={<Trans>Sign up</Trans>}
        append={<SignUpDisclaimer links={links} />}
      >
        {inviteCodeRequired && (
          <Fieldset label={<Trans>Invite code</Trans>}>
            <InputText
              icon={<TokenIcon className="w-5" />}
              autoFocus
              name="inviteCode"
              title={t`Invite code`}
              placeholder={t`example-com-xxxxx-xxxxx`}
              required
              value={inviteCode || ''}
              onChange={(event) => {
                setInviteCode(event.target.value || undefined)
              }}
              enterKeyHint="next"
            />
          </Fieldset>
        )}

        <Fieldset label={<Trans>Email</Trans>}>
          <InputEmailAddress
            autoFocus={!inviteCodeRequired}
            name="email"
            enterKeyHint={hcaptchaSiteKey ? 'next' : 'done'}
            required
            onEmail={setEmail}
          />
        </Fieldset>

        {hcaptchaSiteKey != null && (
          <HCaptcha
            theme={theme}
            sitekey={hcaptchaSiteKey}
            onLoad={onHcaptchaLoad}
            onVerify={onHcaptchaVerify}
            ref={captchaRef}
          />
        )}
      </FormCardAsync>

      <HelpCard className="mt-4" links={links} />
    </LayoutTitlePage>
  )
}
