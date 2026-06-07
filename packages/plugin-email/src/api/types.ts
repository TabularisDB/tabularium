export type EmailTrigger =
  | 'account.welcome'
  | 'plugin.approved'
  | 'plugin.rejected'

export type EmailCategory =
  | 'account'           // always-on transactional (welcome, security)
  | 'owner_ops'         // plugin owner notifications (approved/rejected/yank-of-own-plugin)
  | 'plugin_updates'    // opt-in: subscribed plugin published a new version
  | 'newsletter'        // opt-in marketing (P4)

export const TRIGGER_TO_CATEGORY: Record<EmailTrigger, EmailCategory> = {
  'account.welcome': 'account',
  'plugin.approved': 'owner_ops',
  'plugin.rejected': 'owner_ops',
}

// `force: true` bypasses the preference gate (e.g. for the admin test-mail
// button and for transactional triggers). Transactional triggers (category
// 'account') are always treated as `force=true` regardless of the input flag.
export type SendEmailInput = {
  trigger: EmailTrigger
  user?: { id: string; email: string; locale: string }
  to?: string
  vars: Record<string, unknown>
  locale?: string
  force?: boolean
}

export type EmailMessage = {
  from: string                        // '"Name" <addr>' form
  to: string
  subject: string
  htmlContent: string
  textContent: string
  headers?: Record<string, string>
}

export type EmailProviderName = 'turbo' | 'smtp'

export type SendResult = { providerMid: string | null }

export type VerifyResult = { ok: true } | { ok: false; reason: string }

export interface EmailProvider {
  readonly name: EmailProviderName | 'stub'
  send(msg: EmailMessage): Promise<SendResult>
  verifyAuth(): Promise<VerifyResult>
}

export type SendOutcome =
  | { logId: string; status: 'sent'; providerMid: string | null }
  | { logId: string; status: 'queued' }
  | { logId: string; status: 'suppressed'; reason: string }
  | { logId: string; status: 'failed'; error: string }

export type EmailBucket = 'instant' | 'daily' | 'weekly' | 'off'
export type EmailPreferences = Record<EmailCategory, EmailBucket>

export const OPT_IN_CATEGORIES: EmailCategory[] = ['owner_ops', 'plugin_updates', 'newsletter']
export const TRANSACTIONAL_CATEGORIES: EmailCategory[] = ['account']

export const DEFAULT_PREFERENCES: EmailPreferences = {
  account: 'instant',
  owner_ops: 'instant',
  plugin_updates: 'instant',
  newsletter: 'off',
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension-point contracts.
//
// Plugin-email defines these here; provider-specific plugins (currently only
// plugin-turbosmtp) register implementations against them via
// `host.registry.register(<point>, <name>, <impl>)`. Plugin-email itself only
// *consumes* these via `host.registry.resolve(...)` — it has no idea what's
// behind them.
// ─────────────────────────────────────────────────────────────────────────────

export type BootstrapRegion = 'global' | 'eu'

/**
 * Contract for "set up email-sending from an email + password" flow.
 * Currently implemented by plugin-turbosmtp's API onboarding.
 *
 * Extension point id: `email-bootstrap-driver` (single-active).
 */
export type BootstrapDriver = {
  authorize(email: string, password: string, region: BootstrapRegion): Promise<{ auth: string }>
  listConsumerKeys(
    apiKey: string,
    region: BootstrapRegion,
  ): Promise<Array<{ label: string; consumer_key: string }>>
  deleteConsumerKey(apiKey: string, key: string, region: BootstrapRegion): Promise<{ ok: boolean }>
  createConsumerKey(
    apiKey: string,
    label: string,
    region: BootstrapRegion,
  ): Promise<{ consumer_key: string; consumer_secret: string }>
  sendTestMail(
    apiKey: string,
    consumerKey: string,
    consumerSecret: string,
    region: BootstrapRegion,
    to: string,
    from: string,
  ): Promise<{ mid: string }>
}

export type SuppressionRow = { email: string; source: string; reason?: string | null }

/**
 * Contract for "list / mutate the upstream provider's suppression list".
 *
 * - `list()` is consumed by the croner sync job.
 * - `add()` / `remove()` are consumed by the admin suppression CRUD routes.
 *
 * Implementations should be idempotent and lowercase emails on read.
 *
 * Extension point id: `email-suppression-source` (multi).
 */
export type SuppressionSource = {
  list(fromDate: string, toDate: string): Promise<Array<SuppressionRow>>
  add(email: string, reason: string | null): Promise<void>
  remove(email: string): Promise<void>
  /**
   * Returns true when this source is wired up against active config (api keys
   * present, etc.). Sync/CRUD callers skip sources whose `isActive()` returns
   * false instead of letting them error.
   */
  isActive(): boolean
}
