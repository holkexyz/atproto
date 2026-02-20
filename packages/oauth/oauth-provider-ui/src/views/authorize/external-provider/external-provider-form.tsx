import { Trans } from '@lingui/react/macro'
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
  const [value, setValue] = useState(defaultValue ?? 'bsky.social')

  const doSubmit = async (_signal: AbortSignal) => {
    const trimmedValue = value.trim()
    window.parent.postMessage(
      { type: 'switch-provider', input: trimmedValue },
      '*',
    )
  }

  return (
    <FormCardAsync
      onSubmit={doSubmit}
      invalid={!value.trim()}
      onCancel={onBack}
      cancelLabel={<Trans>Back</Trans>}
      submitLabel={<Trans>Continue</Trans>}
    >
      <Fieldset label={<Trans>Handle or hosting provider</Trans>}>
        <InputText
          icon={<AtSymbolIcon className="w-5" />}
          name="provider-input"
          type="text"
          placeholder="e.g. alice.bsky.social or bsky.social"
          defaultValue={defaultValue ?? 'bsky.social'}
          autoFocus={true}
          required
          onChange={(event) => setValue(event.target.value)}
        />
      </Fieldset>
    </FormCardAsync>
  )
}
