import { eden } from '$lib/eden'
import type { AuthUser } from '$lib/types'

type AuthState = {
	user: AuthUser | null
	loading: boolean
	error: string | null
}

function createAuthStore() {
	let state = $state<AuthState>({ user: null, loading: false, error: null })
	let loaded = false

	async function refresh() {
		state.loading = true
		state.error = null
		try {
			const { data, error } = await eden.auth.me.get()
			if (error) {
				if (error.status !== 401) {
					const v = error.value as { error?: string } | string | null
					state.error = typeof v === 'string' ? v : (v?.error ?? `Request failed (${error.status})`)
				}
				state.user = null
			} else {
				state.user = data as AuthUser
			}
		} catch (e) {
			state.user = null
			state.error = e instanceof Error ? e.message : 'Failed to load user'
		} finally {
			state.loading = false
			loaded = true
		}
	}

	async function logout() {
		try {
			await eden.auth.logout.post({})
		} finally {
			state.user = null
			state.error = null
			state.loading = false
			loaded = true
		}
	}

	return {
		get user() { return state.user },
		get loading() { return state.loading },
		get error() { return state.error },
		get isAdmin() { return state.user?.role === 'admin' },
		get isAuthenticated() { return state.user !== null },
		get loaded() { return loaded },
		refresh,
		logout,
		setUser(u: AuthUser | null) { state.user = u; state.loading = false; loaded = true },
		clear() { state.user = null; state.loading = false },
	}
}

export const auth = createAuthStore()
