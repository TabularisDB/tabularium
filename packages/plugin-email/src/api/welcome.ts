import { sendEmail } from './facade'
import { resolveUserContact } from './contact'
import { env } from '$lib/env'
import { logger } from '$lib/logger'

const log = logger.child({ module: 'email-welcome' })

/**
 * Fire the `account.welcome` trigger for a newly created user.
 *
 * Two call sites:
 *  - Email/password bootstrap register: rootCredentials always exists, so
 *    `resolveUserContact` will find the address.
 *  - OAuth callback (brand-new user branch): typically no rootCredentials
 *    row exists for OAuth signups, so the resolver returns null and we
 *    silently skip. Kept defensive in case a future flow yields an email.
 *
 * Intended to be called inside a `queueMicrotask` by the caller so the
 * request response is not blocked by SMTP latency. Errors are swallowed
 * and logged at warn (or debug for the silent-skip case).
 */
export async function fireWelcomeEmail({
  userId,
  username,
}: {
  userId: string
  username: string
}): Promise<void> {
  try {
    const contact = await resolveUserContact(userId)
    if (!contact) {
      log.debug({ userId }, 'welcome email skipped — no resolvable contact')
      return
    }
    await sendEmail({
      trigger: 'account.welcome',
      user: contact,
      vars: { username, baseUrl: env.BASE_URL },
    })
  } catch (err) {
    log.warn({ err, userId, trigger: 'account.welcome' }, 'welcome email failed')
  }
}
