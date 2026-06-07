type Loader = () => Promise<unknown>

// Hand-maintained id → workspace-package map for SP1.
// Packages don't exist yet — that's why we use dynamic import inside a function
// (not top-level import) so the kernel doesn't statically require packages
// that haven't been split out yet.
const REGISTRY: Record<string, Loader> = {
  // @ts-expect-error — package created in a later SP1 task
  email: () => import('@tabularium/plugin-email'),
  // @ts-expect-error — package created in a later SP1 task
  smtp: () => import('@tabularium/plugin-smtp'),
  // @ts-expect-error — package created in a later SP1 task
  turbosmtp: () => import('@tabularium/plugin-turbosmtp'),
}

export function resolvePluginLoader(id: string): Loader | null {
  return REGISTRY[id] ?? null
}

export function listKnownPluginIds(): string[] {
  return Object.keys(REGISTRY)
}
