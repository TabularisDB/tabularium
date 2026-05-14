import { browser } from '$app/environment'

type Theme = 'dark' | 'light'
const KEY = 'pluggr-theme'

function readInitial(): Theme {
	if (!browser) return 'dark'
	const stored = window.localStorage.getItem(KEY) as Theme | null
	if (stored === 'light' || stored === 'dark') return stored
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function apply(t: Theme) {
	if (!browser) return
	document.documentElement.classList.toggle('dark', t === 'dark')
}

function createThemeStore() {
	let current = $state<Theme>(readInitial())
	if (browser) apply(current)

	return {
		get value() {
			return current
		},
		set(t: Theme) {
			current = t
			if (browser) {
				window.localStorage.setItem(KEY, t)
				apply(t)
			}
		},
		toggle() {
			this.set(current === 'dark' ? 'light' : 'dark')
		},
	}
}

export const theme = createThemeStore()
