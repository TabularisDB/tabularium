import { error } from '@sveltejs/kit'

export type EmailBucket = 'instant' | 'daily' | 'weekly' | 'off'

export type EmailProfile = {
	email: string | null
	locale: string
}

export type EmailSettingsData = {
	profile: EmailProfile
	prefs: Record<string, EmailBucket>
}

export const load = async ({ fetch }): Promise<EmailSettingsData> => {
	const [profileRes, prefsRes] = await Promise.all([
		fetch('/api/users/me/email-profile'),
		fetch('/api/users/me/email-preferences'),
	])
	if (!profileRes.ok) throw error(profileRes.status, await profileRes.text())
	if (!prefsRes.ok) throw error(prefsRes.status, await prefsRes.text())
	const profile = (await profileRes.json()) as EmailProfile
	const { prefs } = (await prefsRes.json()) as { prefs: Record<string, EmailBucket> }
	return { profile, prefs }
}
