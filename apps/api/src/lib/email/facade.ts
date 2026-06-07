import { ulid } from 'ulid'
import { db } from '../../db'
import { emailLog, emailSuppression } from '../../db/schema'
import { getSetting } from '../settings'
import { logger } from '../logger'
import { renderTemplate } from './render'
import { loadPreferences } from './preferences'
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
  const logId = ulid()

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

  // Suppression check happens regardless of provider configuration:
  //   if the recipient is suppressed, we mark the log row and bail before
  //   reading any provider config. force: true bypasses (used by admin
  //   test-mail + security alerts).
  const suppression = await db.query.emailSuppression.findFirst({ where: { email: to } })
  if (suppression && !input.force) {
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
      status: 'suppressed',
      error: `suppressed:${suppression.source}`,
    })
    return { logId, status: 'suppressed', reason: suppression.source }
  }

  // Preference gate. Transactional categories ('account') are always-on.
  const category = TRIGGER_TO_CATEGORY[input.trigger]
  const isTransactional = category === 'account'
  if (!input.force && !isTransactional && input.user) {
    const prefs = await loadPreferences(input.user.id)
    const bucket = prefs[category] ?? 'instant'
    if (bucket === 'off') {
      await db.insert(emailLog).values({
        id: logId,
        userId: input.user.id,
        trigger: input.trigger,
        template: input.trigger,
        locale,
        toAddress: to,
        fromAddress: from,
        subject,
        provider: 'none',
        status: 'suppressed',
        error: 'preference:off',
      })
      return { logId, status: 'suppressed', reason: 'preference:off' }
    }
    if (bucket === 'daily' || bucket === 'weekly') {
      await db.insert(emailLog).values({
        id: logId,
        userId: input.user.id,
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
    // 'instant' → fall through to provider dispatch
  }

  const provider = await resolveProvider()

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
