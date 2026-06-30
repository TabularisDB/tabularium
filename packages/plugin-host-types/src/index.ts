/**
 * Type contracts for the Tabularium plugin host.
 *
 * Plugins import from here to satisfy the kernel without taking a runtime
 * dependency on the core. The kernel implements these types in
 * `apps/api/src/lib/plugin-host/`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Extension points
// ─────────────────────────────────────────────────────────────────────────────

export type ExtensionArity = 'single-active' | 'multi'

export interface ExtensionPointDescriptor {
  id: string
  arity: ExtensionArity
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain events
//
// The typed event bus. Adding a new event = adding a key here. The kernel's
// emit/on signatures are generic over this interface so editors flag missing
// payload fields at the call site.
// ─────────────────────────────────────────────────────────────────────────────

export interface UserContact {
  id: string
  email: string
  locale: string
}

export interface DomainEvents {
  'account.welcome': {
    user: UserContact
    username: string
  }
  'plugin.approved': {
    pluginId: string
    pluginName: string
    ownerId: string
    actor: { id: string; name: string }
  }
  'plugin.rejected': {
    pluginId: string
    pluginName: string
    ownerId: string
    reason: string
    actor: { id: string; name: string }
  }
}

export type EventHandler<K extends keyof DomainEvents> = (
  payload: DomainEvents[K],
) => void | Promise<void>

// ─────────────────────────────────────────────────────────────────────────────
// Contributions (declarative metadata used by the frontend)
// ─────────────────────────────────────────────────────────────────────────────

export interface NavEntryContribution {
  id: string
  /**
   * Target URL. Optional when the entry is a pure group label whose only role
   * is to host `children`. If both `href` and `children` are set, the row
   * navigates AND can be expanded/collapsed by the user.
   */
  href?: string
  labelKey: string
  icon: string
  order?: number
  /**
   * Attach this entry as a child of the entry with this id (top-level or
   * nested). Used by satellite plugins (e.g. plugin-turbosmtp) to slot under
   * an existing group (e.g. plugin-email's `email` entry) without owning the
   * group declaration.
   *
   * If no entry with `parent` id is found at merge time, the entry falls back
   * to top-level. The frontend logs a warning in dev.
   */
  parent?: string
  /**
   * Inline children — declares this entry as a group. Render as a collapsible
   * section in the sidenav. Children are sorted by `order` within their group.
   */
  children?: NavEntryContribution[]
}

export interface PageRouteContribution {
  path: string
  componentImport: string
}

export interface PluginContributions {
  'admin-nav-entry'?: NavEntryContribution[]
  'admin-page-route'?: PageRouteContribution[]
  'user-settings-nav-entry'?: NavEntryContribution[]
  'user-page-route'?: PageRouteContribution[]
  'public-page-route'?: PageRouteContribution[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin module shape
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginMeta {
  id: string
  version: string
  provides?: string[]
  /**
   * Other plugin ids this plugin needs to function.
   *
   * The kernel auto-seeds missing requires (loads them even when not in
   * `infra.plugins.enabled`) and topo-orders so deps load before dependents.
   * Cycles abort the chain with a clear error. Unknown required ids are
   * logged + skipped, and the dependent plugin loads anyway (the missing dep
   * may be optional behaviour the plugin can fall back from).
   *
   * Example: `plugin-smtp` declares `requires: ['email']` because it
   * registers against the `email-provider` extension point that only makes
   * sense when the email orchestrator is loaded.
   */
  requires?: string[]
  contributions?: PluginContributions
}

export interface PluginModule {
  meta: PluginMeta
  register: (host: PluginHost) => void | Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Host API surface given to a plugin at registration time
// ─────────────────────────────────────────────────────────────────────────────

export interface HostLogger {
  info(msg: string, meta?: Record<string, unknown>): void
  warn(msg: string, meta?: Record<string, unknown>): void
  error(msg: string, meta?: Record<string, unknown>): void
  debug(msg: string, meta?: Record<string, unknown>): void
  child(bindings: Record<string, unknown>): HostLogger
}

export interface HostRegistry {
  definePoint(point: ExtensionPointDescriptor): void
  register<T>(point: string, name: string, impl: T): void
  resolve<T>(point: string): T | null
  resolveAll<T>(point: string): Array<{ name: string; impl: T }>
  setActive(point: string, name: string): void
  getActive(point: string): string | null
}

export interface HostEvents {
  on<K extends keyof DomainEvents>(event: K, handler: EventHandler<K>): () => void
  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void
}

export interface HostSettings {
  get(key: string): string | undefined
  has(key: string): boolean
  set(key: string, value: string, opts?: { encrypted?: boolean }): Promise<void>
  delete(key: string): Promise<void>
}

/**
 * Audit-trail surface.
 *
 * The core owns the audit table; plugins shouldn't reach into `$db/schema`
 * to write rows. `record()` mirrors `apps/api/src/lib/audit.recordAudit`;
 * `actorFromAdmin()` mirrors the same module's helper for extracting actor
 * metadata from an admin request.
 */
export interface HostAudit {
  record(args: {
    actorId: string | null
    actorName: string | null
    action: string
    target?: string | null
    meta?: Record<string, unknown> | null
    ip?: string | null
  }): Promise<void>
  actorFromAdmin(
    admin: { id: string; displayName: string | null },
    request: Request,
  ): { actorId: string | null; actorName: string | null; ip: string | null }
}

/**
 * Environment surface — narrow subset of `apps/api/src/lib/env` that plugins
 * are allowed to read. Anything more specialised should go through settings.
 */
export interface HostEnv {
  BASE_URL: string
  WEB_BASE_URL: string | null
}

/**
 * Middleware seam — gives plugins core Elysia middleware without reaching
 * into `$middleware`. Typed as `unknown` so this package stays Elysia-free.
 * Plugin usage: `.use(host.middleware.admin as Elysia)`.
 */
export interface HostMiddleware {
  admin: unknown
  auth: unknown
}

/**
 * At-rest crypto surface mirroring `apps/api/src/lib/crypto`. Used by plugins
 * that need to encrypt/decrypt secrets outside of the kernel-owned settings
 * store (e.g. an OAuth refresh token kept in another DB table).
 */
export interface HostCrypto {
  encryptToken(plaintext: string): string
  decryptToken(ciphertext: string): string
}

/**
 * Build the kernel-enforced table name prefix for a plugin.
 *
 * Plugins MUST prefix every table they own with this value so they cannot
 * collide with core tables or with other plugins. The prefix is computed from
 * the plugin's `meta.id` — the plugin author does not choose it.
 *
 * Format: `pl_<id_normalized>__` (final double underscore is the separator).
 * `<id_normalized>` = lowercase, hyphens replaced with underscores.
 *
 * Throws if the normalized id contains anything outside `[a-z0-9_]`.
 *
 * Two plugins with the same `meta.id` are rejected by the loader at boot, so
 * two plugins cannot ever share a prefix at runtime.
 */
export function pluginTablePrefix(pluginId: string): string {
  const normalized = pluginId.toLowerCase().replace(/-/g, '_')
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    throw new Error(
      `invalid plugin id for table prefix: ${pluginId} — must normalize to /^[a-z0-9_]+$/`,
    )
  }
  return `pl_${normalized}__`
}

export interface PluginHost {
  /** The plugin's own id — set by the kernel before calling `register`. */
  id: string
  /** Pino child logger scoped to the plugin id. */
  logger: HostLogger
  /** Direct Drizzle DB handle — Phase 1 trusts all first-party plugins. */
  db: unknown
  /** Storage handle — Phase 1 trusts all first-party plugins. */
  storage: unknown
  /** Cache handle — Phase 1 trusts all first-party plugins. */
  cache: unknown
  registry: HostRegistry
  events: HostEvents
  settings: HostSettings
  audit: HostAudit
  env: HostEnv
  middleware: HostMiddleware
  crypto: HostCrypto
  /**
   * Mount an Elysia subapp from the plugin onto the core router.
   *
   * Typed as `unknown` so this package stays Elysia-free. Plugins pass an
   * `Elysia` instance via `as unknown` cast; the kernel accumulates them and
   * the boot path applies them with `coreApp.use(subapp)`.
   */
  mountRoutes(app: unknown): void
}
