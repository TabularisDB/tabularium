import { api } from '$lib/api'

export type Branding = {
	name: string
	tagline: string
	primaryHex: string
	accentHex: string
	successHex: string
	logoUrl: string | null
	faviconUrl: string | null
	footerText: string | null
	analyticsScript: string | null
	allowIndexing: boolean
}

const DEFAULTS: Branding = {
	name: 'Pluggr',
	tagline: 'Discover, submit, ship plugins.',
	primaryHex: '#3b82f6',
	accentHex: '#8b5cf6',
	successHex: '#10b981',
	logoUrl: null,
	faviconUrl: null,
	footerText: null,
	analyticsScript: null,
	allowIndexing: true,
}

function createBrandingStore() {
	let state = $state<Branding>({ ...DEFAULTS })
	let loaded = false

	function applyToDom(b: Branding) {
		if (typeof document === 'undefined') return
		document.title = b.name
		const root = document.documentElement
		root.style.setProperty('--brand-primary', b.primaryHex)
		root.style.setProperty('--brand-accent', b.accentHex)
		root.style.setProperty('--brand-success', b.successHex)
		if (b.faviconUrl) {
			const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
			if (link) link.href = b.faviconUrl
		}
		const head = document.head
		head.querySelector<HTMLElement>('[data-pluggr-analytics]')?.remove()
		if (b.analyticsScript) {
			const wrapper = document.createElement('div')
			wrapper.innerHTML = b.analyticsScript
			for (const node of Array.from(wrapper.children)) {
				if (node.tagName === 'SCRIPT') {
					const original = node as HTMLScriptElement
					const clone = document.createElement('script')
					for (const attr of Array.from(original.attributes)) clone.setAttribute(attr.name, attr.value)
					clone.text = original.text
					clone.dataset.pluggrAnalytics = '1'
					head.appendChild(clone)
					continue
				}
				node.setAttribute('data-pluggr-analytics', '1')
				head.appendChild(node)
			}
		}
		const robots = head.querySelector<HTMLMetaElement>('meta[name="robots"][data-pluggr-robots]')
		robots?.remove()
		if (!b.allowIndexing) {
			const meta = document.createElement('meta')
			meta.name = 'robots'
			meta.content = 'noindex,nofollow'
			meta.dataset.pluggrRobots = '1'
			head.appendChild(meta)
		}
	}

	async function refresh() {
		try {
			const fresh = await api.get<Branding>('/api/branding')
			state = fresh
			applyToDom(fresh)
		} catch {
			// fall back to defaults silently
		} finally {
			loaded = true
		}
	}

	return {
		get name() { return state.name },
		get tagline() { return state.tagline },
		get primaryHex() { return state.primaryHex },
		get accentHex() { return state.accentHex },
		get successHex() { return state.successHex },
		get logoUrl() { return state.logoUrl },
		get faviconUrl() { return state.faviconUrl },
		get footerText() { return state.footerText },
		get analyticsScript() { return state.analyticsScript },
		get allowIndexing() { return state.allowIndexing },
		get loaded() { return loaded },
		refresh,
		set(next: Branding) { state = next; applyToDom(next) },
	}
}

export const branding = createBrandingStore()
