import { mount, unmount } from 'svelte'
import type { Component } from 'svelte'
import FeaturedPlugins from './FeaturedPlugins.svelte'
import RecentPlugins from './RecentPlugins.svelte'
import PopularPlugins from './PopularPlugins.svelte'
import PluginGrid from './PluginGrid.svelte'
import PopularRequests from './PopularRequests.svelte'
import Stats from './Stats.svelte'

const REGISTRY: Record<string, Component<Record<string, unknown>>> = {
	'featured-plugins': FeaturedPlugins as Component<Record<string, unknown>>,
	'recent-plugins': RecentPlugins as Component<Record<string, unknown>>,
	'popular-plugins': PopularPlugins as Component<Record<string, unknown>>,
	'plugin-grid': PluginGrid as Component<Record<string, unknown>>,
	'popular-requests': PopularRequests as Component<Record<string, unknown>>,
	stats: Stats as Component<Record<string, unknown>>,
}

type Mounted = { el: HTMLElement; instance: ReturnType<typeof mount> }

export function hydrateWidgets(root: HTMLElement): () => void {
	const mounted: Mounted[] = []
	for (const node of Array.from(root.querySelectorAll('pluggr-widget'))) {
		const el = node as HTMLElement
		const name = el.dataset.name ?? ''
		const Component = REGISTRY[name]
		if (!Component) {
			el.innerHTML = `<span class="text-xs text-muted-foreground">[unknown widget: ${name}]</span>`
			continue
		}
		const props: Record<string, unknown> = {}
		for (const attr of Array.from(el.attributes)) {
			if (!attr.name.startsWith('data-') || attr.name === 'data-name') continue
			const key = attr.name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
			const numeric = Number(attr.value)
			props[key] = Number.isFinite(numeric) && attr.value.trim() !== '' && /^\d+$/.test(attr.value) ? numeric : attr.value
		}
		el.innerHTML = ''
		const instance = mount(Component, { target: el, props })
		mounted.push({ el, instance })
	}
	return () => {
		for (const m of mounted) {
			try {
				unmount(m.instance)
			} catch {
				// ignore — page navigation may have already cleared the DOM
			}
		}
	}
}
