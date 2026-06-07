import { Elysia } from 'elysia'
import buildSettingsRoute from './settings'
import buildTestRoute from './test'
import buildLogRoute from './log'

/**
 * Build the discord-notifier plugin's Elysia subapp.
 *
 * Mirrors plugin-email's pattern — each leaf is a factory invoked after
 * setHost() has run so `host().middleware.admin` is live by the time the
 * route does `.use()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRoutes(): Elysia<any, any, any, any, any, any, any> {
  return new Elysia().group('/api/admin/discord-notifier', (app) =>
    app
      .use(buildSettingsRoute())
      .group('/test', (a) => a.use(buildTestRoute()))
      .group('/log', (a) => a.use(buildLogRoute())),
  )
}
