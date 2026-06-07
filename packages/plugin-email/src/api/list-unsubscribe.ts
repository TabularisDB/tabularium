import { host } from './host-handles'
import { mintUnsubscribeToken } from './unsubscribe-token'
import { TRIGGER_TO_CATEGORY } from './types'
import type { EmailTrigger } from './types'

const TRANSACTIONAL_CATEGORY = 'account'

function extractDomain(fromAddress: string): string {
  // Accepts "Display <local@domain>" or "local@domain"
  const angle = fromAddress.match(/<([^>]+)>/)
  const addr = angle ? angle[1] : fromAddress.trim()
  const at = addr.indexOf('@')
  return at < 0 ? 'tabularis.dev' : addr.slice(at + 1)
}

export function getMailtoDomain(): string {
  const fromDefault = host().settings.get('email.from.default')
  return fromDefault ? extractDomain(fromDefault) : 'tabularis.dev'
}

export type BuildHeadersInput = {
  trigger: EmailTrigger
  user?: { id: string; email: string; locale: string }
  force?: boolean
}

export async function buildOptInHeaders(
  input: BuildHeadersInput,
): Promise<Record<string, string> | null> {
  // No user → no token possible → no List-Unsubscribe header.
  if (!input.user) return null
  // force: true is for admin test mail and security alerts — those should
  // not advertise List-Unsubscribe (recipients shouldn't be able to opt out
  // of break-glass mail with a one-click).
  if (input.force) return null
  const category = TRIGGER_TO_CATEGORY[input.trigger]
  if (category === TRANSACTIONAL_CATEGORY) return null
  const token = await mintUnsubscribeToken(input.user.id)
  const base = host().env.WEB_BASE_URL ?? host().env.BASE_URL
  const unsubUrl = `${base}/email/unsubscribe/${token}`
  const mailto = `unsubscribe+${input.user.id}@${getMailtoDomain()}`
  return {
    'List-Unsubscribe': `<${unsubUrl}>, <mailto:${mailto}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
