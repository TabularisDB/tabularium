import { error, type Load } from '@sveltejs/kit'

export const load: Load = async ({ fetch }) => {
	const [settingsRes, logRes] = await Promise.all([
		fetch('/api/admin/discord-notifier/'),
		fetch('/api/admin/discord-notifier/log/?limit=10'),
	])
	if (!settingsRes.ok) throw error(settingsRes.status, await settingsRes.text())
	const settings = (await settingsRes.json()) as DiscordNotifierSettings
	const log: DiscordNotifierLogPage = logRes.ok
		? ((await logRes.json()) as DiscordNotifierLogPage)
		: { rows: [], total: 0, page: 1, limit: 10 }
	return { settings, log }
}

export type DiscordNotifierSettings = {
	webhookUrlSet: boolean
	username: string | null
	enabledEvents: string[]
}

export type DiscordNotifierLogRow = {
	id: string
	event: string
	status: string
	httpStatus: number | null
	error: string | null
	sentAt: number
}

export type DiscordNotifierLogPage = {
	rows: DiscordNotifierLogRow[]
	total: number
	page: number
	limit: number
}
