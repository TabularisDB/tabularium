import { error, type Load } from '@sveltejs/kit'

export type EmailBucket = 'instant' | 'daily' | 'weekly' | 'off'

export type PreferenceData = {
	invalid: false
	token: string
	email: string | null
	prefs: Record<string, EmailBucket>
	categories: Array<{ key: string; optIn: boolean }>
}

export type InvalidData = { invalid: true }

export const load: Load<{ token: string }, null, PreferenceData | InvalidData> = async ({ fetch, params }) => {
	const token = params.token ?? ''
	const res = await fetch(`/email/preferences/${token}`)
	if (res.status === 401) return { invalid: true }
	if (!res.ok) throw error(res.status, await res.text())
	const data = (await res.json()) as {
		email: string | null
		prefs: Record<string, EmailBucket>
		categories: Array<{ key: string; optIn: boolean }>
	}
	return { invalid: false, token, ...data }
}
