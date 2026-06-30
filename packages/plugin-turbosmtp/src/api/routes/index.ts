import { Elysia } from 'elysia'
import buildStats from './stats'
import buildConsumerKeys from './consumer-keys'
import buildTestConnection from './test-connection'

/**
 * Build the TurboSMTP plugin's admin-only Elysia subapp.
 *
 * Mounted under `/api/admin/email/turbosmtp/*` by the kernel via
 * `host.mountRoutes()`. Factories run inside `register(host)` after
 * `setHost()` so the admin middleware is live when `.use()` chains.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRoutes(): Elysia<any, any, any, any, any, any, any> {
  return new Elysia().group('/api/admin/email/turbosmtp', (app) =>
    app
      .group('/stats', (a) => a.use(buildStats()))
      .group('/consumer-keys', (a) => a.use(buildConsumerKeys()))
      .group('/test-connection', (a) => a.use(buildTestConnection())),
  )
}
