import { error } from '@sveltejs/kit'

export const load = async ({ fetch }) => {
	const res = await fetch('/api/admin/email')
	if (!res.ok) throw error(res.status, await res.text())
	return { settings: (await res.json()) as EmailSettings }
}

export type EmailSettings = {
	provider: 'turbo' | 'smtp' | null
	from: { default: string; overrides: Record<string, string> }
	turbo: {
		apiKeySet: boolean
		consumerKey: string | null
		consumerSecretSet: boolean
		region: 'global' | 'eu'
	}
	smtp: {
		host: string | null
		port: number | null
		user: string | null
		passSet: boolean
		tls: boolean
	}
}
