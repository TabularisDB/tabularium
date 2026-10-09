<script lang="ts">
	import { onMount } from 'svelte'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import { eden } from '$lib/eden'
	import { branding } from '$lib/stores/branding.svelte'
	import BrandLogo from '$components/brand/BrandLogo.svelte'
	import LanguageSwitcher from '$components/LanguageSwitcher.svelte'
	import { features } from '$lib/stores/features.svelte'
	import { i18n } from '$lib/stores/i18n.svelte'
	import { instanceInfo } from '$lib/stores/instance-info.svelte'
	import { m } from '$lib/paraglide/messages'
	import type { Kind, PageSummary } from '$lib/types'
	import { SOCIAL_ICON_PATHS, SOCIAL_LABELS, SOCIAL_PLATFORMS } from '$lib/social'

	type FooterLink = { href: string; label: string; external?: boolean }
	type FooterColumn = { key: string; title: string; links: FooterLink[] }

	// Kind catalogue pages listed under "Registry"; more than this gets noisy.
	const MAX_KIND_LINKS = 4

	let footerPages = $state<PageSummary[]>([])
	let manifestPrimaryFile = $state<string>('tabularium')
	let kindPages = $state<Kind[]>([])
	const year = new Date().getFullYear()

	async function load(locale: string) {
		try {
			const { data, error } = await eden.api.pages.get({ query: { locale } })
			if (error) throw error
			const payload = data as { pages: PageSummary[] }
			footerPages = payload.pages.filter((p) => p.showInFooter)
		} catch {
			footerPages = []
		}
	}

	async function loadManifestSpec() {
		try {
			const { data, error } = await eden.api.manifest.get()
			if (error) throw error
			const payload = data as { paths: string[] }
			if (payload.paths.length > 0) manifestPrimaryFile = payload.paths[0]
		} catch {
			// keep default
		}
	}

	async function loadKinds() {
		try {
			const { data, error } = await eden.api.kinds.get()
			if (error) throw error
			kindPages = (data as { kinds: Kind[] }).kinds.filter((k) => k.publicPageEnabled).slice(0, MAX_KIND_LINKS)
		} catch {
			kindPages = []
		}
	}

	onMount(() => {
		load(i18n.current)
		loadManifestSpec()
		loadKinds()
	})

	$effect(() => {
		void i18n.current
		load(i18n.current)
	})

	const socials = $derived(
		SOCIAL_PLATFORMS.flatMap((platform) => {
			const href = branding.socialLinks?.[platform]
			return href ? [{ platform, href }] : []
		}),
	)

	const columns: FooterColumn[] = $derived(
		(
			[
				{
					key: 'registry',
					title: m.footer_registry(),
					links: [
						{ href: '/plugins', label: m.nav_plugins() },
						...kindPages.map((k) => ({ href: `/c/${k.key}`, label: k.label })),
						...(features.requestsEnabled ? [{ href: '/requests', label: m.nav_requests() }] : []),
						...(features.submissionsEnabled ? [{ href: '/submit', label: m.nav_submit() }] : []),
					],
				},
				{
					key: 'developers',
					title: m.footer_developers(),
					links: [
						{ href: instanceInfo.docsExternalUrl ?? '/docs/plugin-development', label: m.docs_plugin_dev_title() },
						{ href: '/openapi', label: m.footer_openapi(), external: true },
						{ href: '/api/manifest', label: m.footer_spec({ filename: manifestPrimaryFile }), external: true },
						{ href: '/openapi/json', label: m.footer_spec_json(), external: true },
					],
				},
				{
					key: 'about',
					title: m.footer_about(),
					links: [
						...(branding.companionApp.name && branding.companionApp.url
							? [{ href: branding.companionApp.url, label: branding.companionApp.name, external: true }]
							: []),
						...footerPages.map((p) => ({ href: p.path, label: p.title })),
					],
				},
			] as FooterColumn[]
		).filter((c) => c.links.length > 0),
	)

	// tabularis.dev footer: borderless, brand block left, link columns grouped on
	// the right with wide gutters, uppercase column titles, quiet bottom row.
	const columnTitle =
		'font-medium text-foreground text-xs uppercase tracking-wider tabularis:font-semibold tabularis:text-[0.8rem] tabularis:tracking-[0.05em]'
	const footerLink =
		'hover:text-foreground transition-colors w-fit tabularis:text-[0.9rem] tabularis:transition-[color] tabularis:duration-200'
</script>

<footer class="border-t border-border mt-32 bg-card/20 tabularis:mt-24 tabularis:border-t-0 tabularis:bg-transparent">
	<div
		class="mx-auto max-w-6xl px-6 pt-16 pb-10 grid gap-12 lg:grid-cols-12 text-sm tabularis:flex tabularis:flex-wrap tabularis:justify-between tabularis:gap-x-28 tabularis:gap-y-12 tabularis:pt-12 tabularis:pb-0"
	>
		<div
			class="lg:col-span-5 space-y-4 max-w-md tabularis:mr-auto tabularis:flex tabularis:flex-col tabularis:gap-2 tabularis:space-y-0"
		>
			<a href="/" class="inline-flex items-center gap-3 font-semibold tracking-tight">
				<BrandLogo size="lg">
					{#snippet fallback()}
						<svg
							viewBox="0 0 24 24"
							class="h-5 w-5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<rect x="4" y="4" width="14" height="3" rx="0.5" />
							<rect x="5" y="10.5" width="14" height="3" rx="0.5" />
							<rect x="6" y="17" width="14" height="3" rx="0.5" />
						</svg>
					{/snippet}
				</BrandLogo>
			</a>
			<p class="text-muted-foreground leading-relaxed tabularis:text-base tabularis:max-w-xs">
				{branding.footerText ?? branding.tagline}
			</p>
			{#if socials.length > 0}
				<nav
					aria-label={m.footer_social_label()}
					class="flex flex-wrap items-center gap-4 pt-1 tabularis:mt-3 tabularis:gap-5"
				>
					{#each socials as social (social.platform)}
						<a
							href={social.href}
							target="_blank"
							rel={`noopener noreferrer${social.platform === 'mastodon' ? ' me' : ''}`}
							aria-label={SOCIAL_LABELS[social.platform]}
							title={SOCIAL_LABELS[social.platform]}
							class="text-muted-foreground transition-colors hover:text-foreground"
						>
							<svg
								viewBox="0 0 24 24"
								class="h-[1.125rem] w-[1.125rem] tabularis:h-5 tabularis:w-5"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d={SOCIAL_ICON_PATHS[social.platform]} />
							</svg>
						</a>
					{/each}
				</nav>
			{/if}
		</div>

		<nav
			aria-label={m.footer_nav_label()}
			class="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-10 tabularis:flex tabularis:flex-wrap tabularis:gap-x-28 tabularis:gap-y-10"
		>
			{#each columns as column (column.key)}
				<div class="space-y-4 min-w-0 tabularis:min-w-32">
					<div class={columnTitle}>{column.title}</div>
					<ul class="flex flex-col gap-2.5 text-muted-foreground tabularis:gap-3">
						{#each column.links as link (link.href)}
							<li>
								<a
									href={link.href}
									class="{footerLink} {link.external ? 'inline-flex items-center gap-1.5' : ''}"
									data-sveltekit-reload={link.external ? '' : undefined}
								>
									{link.label}
									{#if link.external}<ExternalLink class="h-3 w-3" />{/if}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>
	</div>

	<div class="border-t border-border/60 tabularis:border-t-0">
		<div
			class="mx-auto max-w-6xl px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/70 tabularis:mt-16 sm:tabularis:mt-28 tabularis:items-start sm:tabularis:items-center tabularis:pt-0 tabularis:pb-12 tabularis:text-[0.85rem] tabularis:text-muted-foreground"
		>
			<span class="inline-flex items-center gap-4">
				<span>© {year} {branding.name}</span>
				<LanguageSwitcher />
			</span>
			<a
				href="https://tabularium.wiki"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
			>
				<span>Powered by</span>
				<svg
					viewBox="0 0 24 24"
					class="h-3.5 w-3.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<rect x="4" y="4" width="14" height="3" rx="0.5" />
					<rect x="5" y="10.5" width="14" height="3" rx="0.5" />
					<rect x="6" y="17" width="14" height="3" rx="0.5" />
				</svg>
				<span class="font-medium">Tabularium</span>
			</a>
		</div>
	</div>
</footer>
