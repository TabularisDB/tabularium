import { ulid } from 'ulid'
import { db, schema } from './db'
import { host } from './host-handles'
import { log } from './logger'
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
import { buildOptInHeaders } from './list-unsubscribe'

let providerOverride: EmailProvider | null | undefined = undefined

/** @internal — for tests only */
export function __setProviderForTests(p: EmailProvider | null): void {
  providerOverride = p
}

/**
 * Resolve the active EmailProvider.
 *
 * - Test seam: `__setProviderForTests(stub)` short-circuits.
 * - Production: read `email.provider` setting → 'turbo' | 'smtp' | undefined.
 *   When set, look up the matching provider in the host registry
 *   (registered by plugin-smtp / plugin-turbosmtp). When unset OR the
 *   provider plugin is not loaded, return null → facade queues the mail.
 */
export async function resolveProvider(): Promise<EmailProvider | null> {
  if (providerOverride !== undefined) return providerOverride
  // host() may throw in tests that skipped initPlugins(); be defensive so
  // tests using __setProviderForTests aren't forced to also init plugins.
  let kind: string | undefined
  try {
    kind = host().settings.get('email.provider')
  } catch {
    return null
  }
  if (kind !== 'turbo' && kind !== 'smtp') return null
  const wanted = kind === 'turbo' ? 'turbosmtp' : 'smtp'
  try {
    return host().registry.resolve<EmailProvider>('email-provider')
      // When more than one provider is registered, ensure the one matching
      // the configured setting is selected. setActive is also called from
      // register(host) and the admin PUT route to keep this in sync.
      ?? null
  } catch {
    return null
  }
  // Note: when the provider plugin isn't loaded, resolve() returns null and
  // we fall through to the "no provider configured" branch in sendEmail. The
  // `wanted` name is reserved for the future when sendEmail needs to inspect
  // it for telemetry; suppress unused-var lint for now.
  void wanted
}

function resolveFrom(trigger: EmailTrigger): string {
  const overridesRaw = host().settings.get('email.from.overrides')
  if (overridesRaw) {
    try {
      const overrides = JSON.parse(overridesRaw) as Record<string, string>
      if (overrides[trigger]) return overrides[trigger]
    } catch {
      // ignore malformed JSON; fall through to default
    }
  }
  return host().settings.get('email.from.default') ?? '"Tabularium" <noreply@tabularis.dev>'
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
    await db().insert(schema.emailLog).values({
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
  const suppression = await db().query.emailSuppression.findFirst({ where: { email: to } })
  if (suppression && !input.force) {
    await db().insert(schema.emailLog).values({
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
      await db().insert(schema.emailLog).values({
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
      await db().insert(schema.emailLog).values({
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
    await db().insert(schema.emailLog).values({
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

  const headers = await buildOptInHeaders({
    trigger: input.trigger,
    user: input.user,
    force: input.force,
  })
  const msg: EmailMessage = {
    from,
    to,
    subject,
    htmlContent: html,
    textContent: text,
    ...(headers ? { headers } : {}),
  }
  try {
    const { providerMid } = await provider.send(msg)
    await db().insert(schema.emailLog).values({
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
    log('email').warn('email send failed', { err, trigger: input.trigger, to })
    await db().insert(schema.emailLog).values({
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
