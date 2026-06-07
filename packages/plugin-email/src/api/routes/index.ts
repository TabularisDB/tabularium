import { Elysia } from 'elysia'
import adminSettings from './admin/settings'
import adminBootstrap from './admin/bootstrap'
import adminTest from './admin/test'
import adminSuppressionList from './admin/suppression/index'
import adminSuppressionByEmail from './admin/suppression/by-email'
import usersEmailProfile from './users-me/email-profile'
import usersEmailPreferences from './users-me/email-preferences'
import publicPrefsByToken from './email/preferences-by-token'

/**
 * Build the email plugin's Elysia subapp.
 *
 * Each leaf module declares its handlers at `/` (FSR-style legacy). We
 * compose them under their full URL prefixes here so the resulting subapp
 * can be mounted at the root by the kernel and routes resolve to the same
 * URLs the API exposed before this migration.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRoutes(): Elysia<any, any, any, any, any, any, any> {
  // Elysia's chained .group()/.use() builders accumulate deep generics that
  // don't widen back to the bare `Elysia` return type. We cast through the
  // any-generic form so the public seam stays a plain Elysia for the kernel.
  return (
    new Elysia()
      // admin settings: /api/admin/email (GET, PUT)
      .group('/api/admin/email', (app) =>
        app
          .use(adminSettings)
          .group('/bootstrap', (a) => a.use(adminBootstrap))
          .group('/test', (a) => a.use(adminTest))
          .group('/suppression', (a) =>
            a
              .use(adminSuppressionList)
              .group('/:email', (b) => b.use(adminSuppressionByEmail)),
          ),
      )
      // user settings: /api/users/me/email-{profile,preferences}
      .group('/api/users/me', (app) =>
        app
          .group('/email-profile', (a) => a.use(usersEmailProfile))
          .group('/email-preferences', (a) => a.use(usersEmailPreferences)),
      )
      // public token preferences center: /email/preferences/:token
      .group('/email/preferences', (app) =>
        app.group('/:token', (a) => a.use(publicPrefsByToken)),
      )
  )
}
