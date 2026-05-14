import { eden } from '$lib/eden'

export type Features = {
	submissionsEnabled: boolean
	requestsEnabled: boolean
}

const DEFAULTS: Features = {
	submissionsEnabled: true,
	requestsEnabled: true,
}

function createFeaturesStore() {
	let state = $state<Features>({ ...DEFAULTS })
	let loaded = false

	async function refresh() {
		try {
			const { data, error } = await eden.api.features.get()
			if (error) throw error
			const f = data as Features
			state.submissionsEnabled = f.submissionsEnabled
			state.requestsEnabled = f.requestsEnabled
		} catch {
			state.submissionsEnabled = DEFAULTS.submissionsEnabled
			state.requestsEnabled = DEFAULTS.requestsEnabled
		} finally {
			loaded = true
		}
	}

	return {
		get submissionsEnabled() { return state.submissionsEnabled },
		get requestsEnabled() { return state.requestsEnabled },
		get loaded() { return loaded },
		refresh,
	}
}

export const features = createFeaturesStore()
