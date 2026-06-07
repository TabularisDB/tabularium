// Accumulator for Elysia subapps mounted by plugins via `host.mountRoutes(app)`.
//
// Typed as `unknown` to keep the public `PluginHost` interface Elysia-free.
// The boot path casts entries back to `Elysia` when wiring them onto the core
// router; for SP1 the boot wiring is deferred to Task 14, so this module just
// stores them.

const mounted: unknown[] = []

export function recordRoutes(app: unknown): void {
  mounted.push(app)
}

export function listRoutes(): unknown[] {
  return mounted
}

/** Test/reset helper. */
export function __clearRoutes(): void {
  mounted.length = 0
}
