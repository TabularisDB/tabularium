export type ProviderKind = 'github' | 'gitlab' | 'gitea'

export type AuthIdentity = {
	id: string
	providerInstanceId: string
	providerKind: ProviderKind
	providerDisplayName: string
	username: string
}

export type AuthUser = {
	id: string
	username: string
	displayName: string
	role: 'user' | 'admin'
	identities: AuthIdentity[]
}

export type ProviderInfo = {
	id: string
	kind: ProviderKind
	displayName: string
	baseUrl: string
	logoUrl: string | null
}

export type AssetEntry = {
	url: string
	size?: number
	sha256?: string
}

export type Release = {
	id: string
	pluginId: string
	version: string
	minRuntimeVersion: string | null
	assets: Record<string, AssetEntry>
	createdAt: number
}

export type Screenshot = {
	url: string
	caption: string | null
	alt: string | null
}

export type Plugin = {
	id: string
	ownerId: string
	providerInstanceId?: string | null
	name: string
	description: string
	author: string
	repoUrl: string
	homepage: string
	latestVersion: string | null
	status?: 'approved' | 'pending' | 'rejected'
	category: string | null
	tags: string[]
	license: string | null
	iconUrl: string | null
	screenshots: Screenshot[]
	documentationUrl: string | null
	supportEmail: string | null
	issuesUrl: string | null
	featured: boolean
	featuredOrder: number | null
	downloads: number
	manifestFetchedAt: number | null
	createdAt: number
	updatedAt: number
	releases?: Release[]
	readmeHtml?: string | null
	readmeLocale?: string | null
	readmeAvailableLocales?: string[]
}

export type PluginStats = {
	stars: number | null
	forks: number | null
	watchers: number | null
	lastPushAt: number | null
	homepage: string | null
}

export type Kind = {
	key: string
	label: string
	description: string | null
}

export type PluginListResponse = {
	total: number
	page: number
	limit: number
	plugins: Plugin[]
	facets: {
		categories: Array<{ value: string; count: number }>
		kinds: Array<{ key: string; label: string; count: number }>
	}
}

export type PageSummary = {
	slug: string
	path: string
	title: string
	navOrder: number | null
	showInFooter: boolean
	updatedAt: number
}

export type PageRendered = {
	slug: string
	path: string
	title: string
	html: string
	updatedAt: number
}

export type PluginRequest = {
	id: string
	slug: string
	name: string
	description: string
	requesterId: string
	upvotes: number
	createdAt: number
	claims: number
	claimedByMe: boolean
}

export type SubmittableRepo = {
	identityId: string
	providerInstanceId: string
	fullName: string
	owner: string
	name: string
	url: string
	description: string | null
	isPrivate: boolean
}

export type RepoGroup = {
	identityId: string
	providerInstanceId: string
	providerDisplayName: string
	providerKind: ProviderKind
	username: string
	repos: SubmittableRepo[]
	error: string | null
	reauthUrl: string
}

export type ProviderInstanceAdmin = {
	id: string
	kind: ProviderKind
	displayName: string
	baseUrl: string
	clientId: string
	logoUrl: string | null
	enabled: boolean
}

export type AdminUser = {
	id: string
	displayName: string
	email: string | null
	role: 'user' | 'admin'
	createdAt: number
}

export type InitStatus = {
	requiresInit: boolean
	setupCompleted: boolean
	emailRecoveryAvailable: boolean
}

export type InitDefaults = {
	database: { url: string }
	baseUrl: string
	webBaseUrl: string | null
	providers: {
		github: { clientId: string; clientSecretSet: boolean }
		gitlab: { clientId: string; clientSecretSet: boolean }
		codeberg: { clientId: string; clientSecretSet: boolean }
	}
}

export type SubmitSuccess = {
	slug: string
	webhookSecret: string
	webhookUrl: string
	webhookInstalled: boolean
	webhookSetupReason: string | null
	repoUrl: string
	providerInstanceId: string
	providerKind: ProviderKind
}
