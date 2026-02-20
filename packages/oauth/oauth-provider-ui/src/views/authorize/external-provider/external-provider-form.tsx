import { Trans, useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { Fieldset } from '../../../components/forms/fieldset.tsx'
import { FormCardAsync } from '../../../components/forms/form-card-async.tsx'
import { InputText } from '../../../components/forms/input-text.tsx'
import { AtSymbolIcon } from '../../../components/utils/icons.tsx'

export interface ExternalProviderFormProps {
  onBack: () => void
  defaultValue?: string
}

export function ExternalProviderForm({
  onBack,
  defaultValue,
}: ExternalProviderFormProps) {
  const { t } = useLingui()
  const [value, setValue] = useState(defaultValue ?? 'bsky.social')

  const doSubmit = async (_signal: AbortSignal) => {
    if (window.parent === window) {
      throw new Error(
        t`This page must be opened inside an iframe. Please use the sign-in flow from the application.`,
      )
    }
    const trimmedValue = value.trim()
    window.parent.postMessage(
      { type: 'switch-provider', input: trimmedValue },
      '*',
    )
  }

  return (
    <>
      <FormCardAsync
        onSubmit={doSubmit}
        invalid={!value.trim()}
        submitLabel={<Trans>Continue</Trans>}
      >
        <Fieldset label={<Trans>Handle or hosting provider</Trans>}>
          <InputText
            icon={<AtSymbolIcon className="w-5" />}
            name="provider-input"
            type="text"
            placeholder={t`e.g. alice.bsky.social or bsky.social`}
            defaultValue={defaultValue ?? 'bsky.social'}
            autoFocus={true}
            required
            onChange={(event) => setValue(event.target.value)}
          />
        </Fieldset>
      </FormCardAsync>
      <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
        <button
          type="button"
          className="underline hover:no-underline"
          onClick={onBack}
        >
          <Trans>Sign in with Certified</Trans>
        </button>
      </div>
    </>
  )
}
