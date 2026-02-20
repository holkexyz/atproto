import { Trans } from '@lingui/react/macro'
import { clsx } from 'clsx'
import { JSX, useState, useRef, useEffect } from 'react'
import type { LinkDefinition } from '@atproto/oauth-provider-api'
import { LinkAnchor } from '../../../components/utils/link-anchor.tsx'
import { Override } from '../../../lib/util.ts'

export type SignUpDisclaimerProps = Override<
  Omit<JSX.IntrinsicElements['p'], 'children'>,
  {
    links?: readonly LinkDefinition[]
  }
>

export function SignUpDisclaimer({
  links,

  // p
  className,
  ...attrs
}: SignUpDisclaimerProps) {
  const tosLink = links?.find((l) => l.rel === 'terms-of-service')
  const ppLink = links?.find((l) => l.rel === 'privacy-policy')

  const [popupOpen, setPopupOpen] = useState(false)
  const popupRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!popupOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setPopupOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [popupOpen])

  return (
    <p
      className={clsx('text-sm text-slate-500 dark:text-slate-400', className)}
      {...attrs}
    >
      <Trans>
        By creating an account you agree to the{' '}
        {tosLink ? (
          <LinkAnchor className="text-primary underline" link={tosLink}>
            <Trans>Terms of Service</Trans>
          </LinkAnchor>
        ) : (
          <Trans>Terms of Service</Trans>
        )}
        {' and the '}
        {ppLink ? (
          <LinkAnchor className="text-primary underline" link={ppLink}>
            <Trans>Privacy Policy</Trans>
          </LinkAnchor>
        ) : (
          <Trans>Privacy Policy</Trans>
        )}{' '}
        of Certified.
      </Trans>
      <span ref={popupRef} className="relative inline-block">
        <button
          type="button"
          aria-label="More information about Certified"
          className="text-slate-400 hover:text-slate-600 focus:outline-none dark:hover:text-slate-300"
          onClick={() => setPopupOpen((prev) => !prev)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="ml-1 inline-block h-4 w-4 align-text-bottom"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {popupOpen && (
          <span className="absolute left-0 top-6 z-10 w-56 rounded-lg bg-white p-3 text-sm text-slate-700 shadow-lg dark:bg-slate-800 dark:text-slate-200">
            Certified helps you build a verifiable digital identity.{' '}
            <a
              href="https://certified-app-seven.vercel.app/why-certified"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Learn more.
            </a>
          </span>
        )}
      </span>
    </p>
  )
}
