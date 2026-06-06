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
