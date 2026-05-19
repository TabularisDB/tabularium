import { eden } from '$lib/eden'

export type AppUrlScheme = {
  name: string
  scheme: string
  kinds?: string[]
}

export type InstanceInfo = {
  appUrlSchemes: AppUrlScheme[]
}

const DEFAULTS: InstanceInfo = {
  appUrlSchemes: [],
}

function createInstanceInfoStore() {
  let state = $state<InstanceInfo>({ ...DEFAULTS })
  let loaded = false

  async function refresh() {
    try {
      const { data, error } = await eden.api.instance.info.get()
      if (error) throw error
      const i = data as InstanceInfo
      state.appUrlSchemes = i.appUrlSchemes ?? []
    } catch {
      state.appUrlSchemes = DEFAULTS.appUrlSchemes
    } finally {
      loaded = true
    }
  }

  function pickSchemeForKind(kind: string | null | undefined): AppUrlScheme | null {
    if (state.appUrlSchemes.length === 0) return null
    if (kind) {
      for (const s of state.appUrlSchemes) {
        if (s.kinds?.includes(kind)) return s
      }
    }
    for (const s of state.appUrlSchemes) {
      if (!s.kinds) return s
    }
    return null
  }

  return {
    get appUrlSchemes() {
      return state.appUrlSchemes
    },
    get loaded() {
      return loaded
    },
    pickSchemeForKind,
    refresh,
  }
}

export const instanceInfo = createInstanceInfoStore()

export function buildInstallDeepLink(
  scheme: AppUrlScheme,
  args: { registry: string; slug: string; version: string; kind?: string },
): string {
  const params = new URLSearchParams({
    registry: args.registry,
    slug: args.slug,
    version: args.version,
  })
  if (args.kind) params.set('kind', args.kind)
  return `${scheme.scheme}://install?${params.toString()}`
}
