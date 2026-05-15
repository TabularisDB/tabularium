import { error, redirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'
import type { InitStatus } from '$lib/types'

export const ssr = false
export const prerender = false

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/init/status')
	if (!res.ok) error(404, 'Not found')
	const status = (await res.json()) as InitStatus
	if (status.requiresInit) redirect(302, '/init')
	if (!status.emailRecoveryAvailable) error(404, 'Not found')
	return {}
}
