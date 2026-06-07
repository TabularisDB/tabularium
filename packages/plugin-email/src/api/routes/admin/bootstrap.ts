import { Elysia, t } from 'elysia'
import { host } from '../../host-handles'
import type { BootstrapDriver, BootstrapRegion } from '../../types'

// Re-export so older consumers (apps/api re-export chain) can keep importing
// `BootstrapDriver` from plugin-email without breakage.
export type { BootstrapDriver }

// Test seam — kept as a back-compat shim. Tests can either use this OR
// register a stub via `host.registry.register('email-bootstrap-driver', ...)`;
// the seam takes priority when set.
let testDriverOverride: BootstrapDriver | null = null
export function __setBootstrapClientForTests(d: BootstrapDriver | null): void {
  testDriverOverride = d
}

function resolveDriver(): BootstrapDriver | null {
  if (testDriverOverride) return testDriverOverride
  return host().registry.resolve<BootstrapDriver>('email-bootstrap-driver')
}

const RESERVED_LABEL = 'tabularium'

type AdminCtxBase = {
  admin: { id: string; displayName: string | null }
  user: { sub: string; username?: string; role?: string }
  apiToken: { id: string; scopes: string[] | null } | null
}

/**
 * Build the bootstrap Elysia subapp.
 *
 * Constructed lazily by `buildRoutes()` (which runs inside `register(host)`)
 * so `host().middleware.admin` is live by the time `.use()` is invoked.
 *
 * The `as Elysia<...>` cast on `base` reinstates the derive types that the
 * host-types interface erases (it stores middleware as `unknown` to stay
 * Elysia-free). Handler contexts pick `admin`/`user` off the merged derive.
 */
export default function buildBootstrapRoute() {
  const base = new Elysia() as Elysia<
    '',
    { decorator: AdminCtxBase; store: {}; derive: AdminCtxBase; resolve: {} }
  >
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return base.use(host().middleware.admin as any).post(
    '/',
    async ({ body, admin, request, set }) => {
      const region: BootstrapRegion = body.region === 'eu' ? 'eu' : 'global'
      const driver = resolveDriver()
      if (!driver) {
        set.status = 412
        return { error: 'no email-bootstrap-driver registered' }
      }
      try {
        const { auth: apiKey } = await driver.authorize(body.email, body.password, region)

        const existing = await driver.listConsumerKeys(apiKey, region)
        const reserved = existing.find((k) => k.label === RESERVED_LABEL)
        if (reserved) await driver.deleteConsumerKey(apiKey, reserved.consumer_key, region)

        const created = await driver.createConsumerKey(apiKey, RESERVED_LABEL, region)

        await host().settings.set('email.provider', 'turbo')
        await host().settings.set('email.turbo.region', region)
        await host().settings.set('email.turbo.api_key', apiKey, { encrypted: true })
        await host().settings.set('email.turbo.consumer_key', created.consumer_key)
        await host().settings.set('email.turbo.consumer_secret', created.consumer_secret, { encrypted: true })

        const from = `"Tabularium" <${body.email}>`
        const { mid } = await driver.sendTestMail(
          apiKey,
          created.consumer_key,
          created.consumer_secret,
          region,
          body.email,
          from,
        )

        await host().audit.record({
          ...host().audit.actorFromAdmin(admin, request),
          action: 'email.bootstrap_success',
          target: 'settings:email',
          meta: { region, label: RESERVED_LABEL },
        })
        return { ok: true, consumerKeyLabel: RESERVED_LABEL, testMid: mid }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown'
        await host().audit.record({
          ...host().audit.actorFromAdmin(admin, request),
          action: 'email.bootstrap_failed',
          target: 'settings:email',
          meta: { region, reason },
        })
        set.status = 422
        return { error: reason }
      }
    },
    {
      detail: {
        tags: ['Admin'],
        summary: 'Bootstrap TurboSMTP from email + password',
        operationId: 'bootstrapTurboEmail',
      },
      body: t.Object({
        email: t.String({ minLength: 5, maxLength: 254 }),
        password: t.String({ minLength: 1, maxLength: 200 }),
        region: t.Optional(t.Union([t.Literal('global'), t.Literal('eu')])),
      }),
      response: {
        200: t.Object({ ok: t.Boolean(), consumerKeyLabel: t.String(), testMid: t.String() }),
        401: t.Object({ error: t.String() }),
        412: t.Object({ error: t.String() }),
        422: t.Object({ error: t.String() }),
      },
    },
  )
}
