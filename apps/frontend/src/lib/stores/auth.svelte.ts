import { api } from '$lib/api'
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
			state.user = await api.get<AuthUser>('/auth/me')
		} catch (e) {
			state.user = null
			if ((e as { status?: number }).status !== 401) {
				state.error = e instanceof Error ? e.message : 'Failed to load user'
			}
		} finally {
			state.loading = false
			loaded = true
		}
	}

	async function logout() {
		try {
			await api.post('/auth/logout')
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
