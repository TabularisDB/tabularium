import { ulid } from 'ulid'
import { db } from '../../db'
import { emailLog } from '../../db/schema'
import { getSetting } from '../settings'
import { logger } from '../logger'
import { renderTemplate } from './render'
import { TRIGGER_TO_CATEGORY } from './types'
import type {
  EmailMessage,
  EmailProvider,
  EmailTrigger,
  SendEmailInput,
  SendOutcome,
} from './types'
import { buildTurboProvider } from './providers/turbo'
import { buildSmtpProvider } from './providers/smtp'

const log = logger.child({ module: 'email' })

let providerOverride: EmailProvider | null | undefined = undefined

/** @internal — for tests only */
export function __setProviderForTests(p: EmailProvider | null): void {
  providerOverride = p
}

export async function resolveProvider(): Promise<EmailProvider | null> {
  if (providerOverride !== undefined) return providerOverride
  const kind = getSetting('email.provider')
  if (kind === 'turbo') return buildTurboProvider()
  if (kind === 'smtp') return buildSmtpProvider()
  return null
}

function resolveFrom(trigger: EmailTrigger): string {
  const overridesRaw = getSetting('email.from.overrides')
  if (overridesRaw) {
    try {
      const overrides = JSON.parse(overridesRaw) as Record<string, string>
      if (overrides[trigger]) return overrides[trigger]
    } catch {
      // ignore malformed JSON; fall through to default
    }
  }
  return getSetting('email.from.default') ?? '"Tabularium" <noreply@tabularis.dev>'
}

export async function sendEmail(input: SendEmailInput): Promise<SendOutcome> {
  const to = input.user?.email ?? input.to
  if (!to) throw new Error('sendEmail: either input.user.email or input.to is required')

  const locale = input.locale ?? input.user?.locale ?? 'en'
  const from = resolveFrom(input.trigger)

  let subject = '(rendering pending)'
  let html = ''
  let text = ''
  try {
    const rendered = await renderTemplate({ trigger: input.trigger, locale, vars: input.vars })
    subject = rendered.subject
    html = rendered.html
    text = rendered.text
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const logId = ulid()
    await db.insert(emailLog).values({
      id: logId,
      userId: input.user?.id ?? null,
      trigger: input.trigger,
      template: input.trigger,
      locale,
      toAddress: to,
      fromAddress: from,
      subject,
      provider: 'none',
      status: 'failed',
      error: `render: ${error}`,
    })
    return { logId, status: 'failed', error }
  }

  const provider = await resolveProvider()
  const logId = ulid()

  if (!provider) {
    await db.insert(emailLog).values({
      id: logId,
      userId: input.user?.id ?? null,
      trigger: input.trigger,
      template: input.trigger,
      locale,
      toAddress: to,
      fromAddress: from,
      subject,
      provider: 'none',
      status: 'queued',
    })
    return { logId, status: 'queued' }
  }

  // P1 will plug the suppression check here; P1 also plugs the
  // preference gate. For P0, transactional always-on:
  const _category = TRIGGER_TO_CATEGORY[input.trigger]
  void _category // referenced for clarity; gate is P1

  const msg: EmailMessage = { from, to, subject, htmlContent: html, textContent: text }
  try {
    const { providerMid } = await provider.send(msg)
    await db.insert(emailLog).values({
      id: logId,
      userId: input.user?.id ?? null,
      trigger: input.trigger,
      template: input.trigger,
      locale,
      toAddress: to,
      fromAddress: from,
      subject,
      provider: provider.name,
      providerMid,
      status: 'sent',
    })
    return { logId, status: 'sent', providerMid }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.warn({ err, trigger: input.trigger, to }, 'email send failed')
    await db.insert(emailLog).values({
      id: logId,
      userId: input.user?.id ?? null,
      trigger: input.trigger,
      template: input.trigger,
      locale,
      toAddress: to,
      fromAddress: from,
      subject,
      provider: provider.name,
      status: 'failed',
      error,
    })
    return { logId, status: 'failed', error }
  }
}
