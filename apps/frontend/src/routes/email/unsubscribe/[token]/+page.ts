import { error } from '@sveltejs/kit'

export type EmailBucket = 'instant' | 'daily' | 'weekly' | 'off'

export type PreferenceData = {
	invalid: false
	token: string
	email: string | null
	prefs: Record<string, EmailBucket>
	categories: Array<{ key: string; optIn: boolean }>
}

export type InvalidData = { invalid: true }

export const load = async ({
	fetch,
	params,
}): Promise<PreferenceData | InvalidData> => {
	const res = await fetch(`/email/preferences/${params.token}`)
	if (res.status === 401) return { invalid: true }
	if (!res.ok) throw error(res.status, await res.text())
	const data = (await res.json()) as {
		email: string | null
		prefs: Record<string, EmailBucket>
		categories: Array<{ key: string; optIn: boolean }>
	}
	return { invalid: false, token: params.token, ...data }
}
