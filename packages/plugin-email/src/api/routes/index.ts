import { Elysia } from 'elysia'
import buildAdminSettings from './admin/settings'
import buildAdminBootstrap from './admin/bootstrap'
import buildAdminTest from './admin/test'
import buildAdminSuppressionList from './admin/suppression/index'
import buildAdminSuppressionByEmail from './admin/suppression/by-email'
import buildUsersEmailProfile from './users-me/email-profile'
import buildUsersEmailPreferences from './users-me/email-preferences'
import buildPublicPrefsByToken from './email/preferences-by-token'

/**
 * Build the email plugin's Elysia subapp.
 *
 * Each leaf module exports a *factory* (not a pre-constructed Elysia) so that
 * `host().middleware.admin` is live by the time the route does `.use()`.
 * Factories are invoked here, inside `buildRoutes()`, which is called from
 * `register(host)` after `setHost()` has run.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRoutes(): Elysia<any, any, any, any, any, any, any> {
  return (
    new Elysia()
      // admin settings: /api/admin/email (GET, PUT)
      .group('/api/admin/email', (app) =>
        app
          .use(buildAdminSettings())
          .group('/bootstrap', (a) => a.use(buildAdminBootstrap()))
          .group('/test', (a) => a.use(buildAdminTest()))
          .group('/suppression', (a) =>
            a
              .use(buildAdminSuppressionList())
              .group('/:email', (b) => b.use(buildAdminSuppressionByEmail())),
          ),
      )
      // user settings: /api/users/me/email-{profile,preferences}
      .group('/api/users/me', (app) =>
        app
          .group('/email-profile', (a) => a.use(buildUsersEmailProfile()))
          .group('/email-preferences', (a) => a.use(buildUsersEmailPreferences())),
      )
      // public token preferences center: /email/preferences/:token
      .group('/email/preferences', (app) =>
        app.group('/:token', (a) => a.use(buildPublicPrefsByToken())),
      )
  )
}
