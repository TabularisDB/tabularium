import type { Elysia } from 'elysia'

// Cross-package type entry. `apps/api/src/index.ts` boots the server and uses
// the `$lib/*`/`$db`/`$middleware/*` path aliases, which only resolve under
// the api's own tsconfig. Consumers like `@tabularium/client` (and the
// frontend's svelte-check via the Eden Treaty type chain) can't see those
// aliases and would emit ~20 "Cannot find module" errors per check.
//
// The file-router used at runtime is configured with `types: false`, so even
// after resolving the aliases the computed `Awaited<ReturnType<typeof
// createApp>>` would still lack the dynamic routes. To keep Eden Treaty's
// proxy navigable on the client we hand-shape the App type so its `~Routes`
// slot accepts any path — matching the practical runtime behavior (treaty
// dispatches by string path regardless).
export type App = Elysia<
  '',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  '~Routes': Record<string, any>
}
