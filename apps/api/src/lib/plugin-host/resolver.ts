type Loader = () => Promise<unknown>

// Hand-maintained id → workspace-package map for SP1.
const REGISTRY: Record<string, Loader> = {
  email: () => import('@tabularium/plugin-email'),
  smtp: () => import('@tabularium/plugin-smtp'),
  turbosmtp: () => import('@tabularium/plugin-turbosmtp'),
  'discord-notifier': () => import('@tabularium/plugin-discord-notifier'),
}

export function resolvePluginLoader(id: string): Loader | null {
  return REGISTRY[id] ?? null
}

export function listKnownPluginIds(): string[] {
  return Object.keys(REGISTRY)
}
