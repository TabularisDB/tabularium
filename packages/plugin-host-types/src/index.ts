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
  href: string
  labelKey: string
  icon: string
  order?: number
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
  /**
   * Mount an Elysia subapp from the plugin onto the core router.
   *
   * Typed as `unknown` so this package stays Elysia-free. Plugins pass an
   * `Elysia` instance via `as unknown` cast; the kernel accumulates them and
   * the boot path applies them with `coreApp.use(subapp)`.
   */
  mountRoutes(app: unknown): void
}
