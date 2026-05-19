import { eden } from '$lib/eden'
import type { Locale } from '$lib/stores/i18n.svelte'

export type Translations = Partial<Record<Locale, string>>

export type HomeCopy = {
  eyebrow: { enabled: boolean; text: Translations }
  features: {
    enabled: boolean
    dropin: { title: Translations; body: Translations }
    providers: { title: Translations; body: Translations }
    release: { title: Translations; body: Translations }
  }
}

export function defaultHomeCopy(): HomeCopy {
  return {
    eyebrow: { enabled: true, text: {} },
    features: {
      enabled: true,
      dropin: { title: {}, body: {} },
      providers: { title: {}, body: {} },
      release: { title: {}, body: {} },
    },
  }
}

function createHomeCopyStore() {
  let state = $state<HomeCopy>(defaultHomeCopy())
  let loaded = $state(false)

  async function refresh() {
    try {
      const { data, error } = await eden.api['home-copy'].get()
      if (error) throw error
      state = data as HomeCopy
    } catch {
      state = defaultHomeCopy()
    } finally {
      loaded = true
    }
  }

  function pickForLocale(map: Translations, locale: Locale): string | null {
    const v = map[locale] ?? map.en ?? ''
    const trimmed = v.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return {
    get eyebrow() {
      return state.eyebrow
    },
    get features() {
      return state.features
    },
    get loaded() {
      return loaded
    },
    pick: pickForLocale,
    refresh,
    setLocal(next: HomeCopy) {
      state = next
    },
  }
}

export const homeCopy = createHomeCopyStore()
