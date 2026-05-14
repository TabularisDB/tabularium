<script lang="ts">
	import { page } from '$app/state'
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import ExternalLink from '@lucide/svelte/icons/external-link'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import UserRoundCog from '@lucide/svelte/icons/user-round-cog'
	import Boxes from '@lucide/svelte/icons/boxes'
	import BookOpen from '@lucide/svelte/icons/book-open'
	import Bug from '@lucide/svelte/icons/bug'
	import Mail from '@lucide/svelte/icons/mail'
	import Shield from '@lucide/svelte/icons/shield'
	import Copy from '@lucide/svelte/icons/copy'
	import Badge from '$components/ui/Badge.svelte'
	import Button from '$components/ui/Button.svelte'
	import Skeleton from '$components/ui/Skeleton.svelte'
	import { eden } from '$lib/eden'
	import { auth } from '$lib/stores/auth.svelte'
	import { toast } from 'svelte-sonner'
	import type { Plugin } from '$lib/types'

	const slug = $derived(page.params.slug)

	let plugin = $state<Plugin | null>(null)
	let loading = $state(true)
	let notFound = $state(false)
	let deleting = $state(false)
	let activeScreenshot = $state<number | null>(null)

	async function load() {
		loading = true
		notFound = false
		try {
			const { data, error } = await eden.api.plugins({ slug }).get()
			if (error) {
				if (error.status === 404) notFound = true
				return
			}
			plugin = data as Plugin
		} finally {
			loading = false
		}
	}

	onMount(load)

	$effect(() => {
		void slug
		load()
	})

	const sortedReleases = $derived(
		plugin?.releases ? [...plugin.releases].sort((a, b) => b.createdAt - a.createdAt) : [],
	)
	const isOwner = $derived(auth.user?.id === plugin?.ownerId)

	const baseUrl = $derived(typeof window === 'undefined' ? '' : window.location.origin)
	const installCommand = $derived(
		plugin
			? `curl -L "${baseUrl}/api/plugins/${plugin.id}/latest?os=$(uname -s | tr '[:upper:]' '[:lower:]')&arch=$(uname -m)"`
			: '',
	)

	async function copyInstall() {
		try {
			await navigator.clipboard.writeText(installCommand)
			toast.success('Copied')
		} catch {
			toast.error('Clipboard unavailable')
		}
	}

	async function deletePlugin() {
		if (!plugin) return
		if (!confirm(`Delete plugin '${plugin.id}' and all releases?`)) return
		deleting = true
		try {
			const { error } = await eden.api.plugins({ slug: plugin.id }).delete()
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Plugin deleted')
			goto('/plugins')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Delete failed')
			deleting = false
		}
	}

	async function transferOwnership() {
		if (!plugin) return
		const newOwnerId = prompt(
			'Offer this plugin to which user?\n\nEnter the recipient\'s ULID (visible in their /settings page).\nThey have 7 days to accept — ownership only changes once they confirm.',
		)
		if (!newOwnerId?.trim()) return
		const message = prompt('Optional message for the recipient:') ?? undefined
		try {
			const { error } = await eden.api.plugins({ slug: plugin.id }).transfer.post({
				newOwnerId: newOwnerId.trim(),
				message: message?.trim() || undefined,
			})
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Transfer offered — recipient must accept within 7 days')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Transfer failed')
		}
	}

	function formatBytes(n: number | undefined): string {
		if (!n) return '—'
		if (n < 1024) return `${n} B`
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
		return `${(n / 1024 / 1024).toFixed(1)} MB`
	}
</script>

<div class="mx-auto max-w-5xl px-6 py-12 space-y-10">
	{#if loading}
		<Skeleton class="h-12 w-1/2 rounded-md" />
		<Skeleton class="h-32 w-full rounded-md" />
	{:else if notFound}
		<div class="rounded-lg border border-dashed border-border p-12 text-center space-y-3">
			<p class="text-muted-foreground">Plugin not found.</p>
			<Button size="sm" variant="outline" href="/plugins">Back to catalog</Button>
		</div>
	{:else if plugin}
		<header class="space-y-4">
			<div class="flex items-start gap-4">
				<div class="h-16 w-16 rounded-lg bg-primary/10 text-primary flex items-center justify-center overflow-hidden flex-shrink-0">
					{#if plugin.iconUrl}
						<img src={plugin.iconUrl} alt={plugin.name} class="h-16 w-16 object-contain" loading="eager" />
					{:else}
						<Boxes class="h-8 w-8" />
					{/if}
				</div>
				<div class="flex-1 min-w-0 space-y-1">
					<div class="flex items-center gap-3 flex-wrap">
						<h1 class="text-3xl font-semibold tracking-tight">{plugin.name}</h1>
						{#if plugin.latestVersion}
							<Badge variant="secondary" class="font-mono">v{plugin.latestVersion}</Badge>
						{/if}
						{#if plugin.featured}
							<Badge variant="default">Featured</Badge>
						{/if}
					</div>
					<p class="text-base text-foreground/90">{plugin.description}</p>
				</div>
				{#if isOwner}
					<div class="flex flex-col gap-2 flex-shrink-0">
						<Button variant="outline" size="sm" onclick={transferOwnership} disabled={deleting}>
							<UserRoundCog class="h-3.5 w-3.5" />
							Transfer
						</Button>
						<Button variant="destructive" size="sm" onclick={deletePlugin} disabled={deleting}>
							<Trash2 class="h-3.5 w-3.5" />
							{deleting ? 'Deleting…' : 'Delete'}
						</Button>
					</div>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
				<span>By <span class="text-foreground">{plugin.author.split('<')[0].trim()}</span></span>
				{#if plugin.license}
					<span class="inline-flex items-center gap-1">
						<Shield class="h-3 w-3" />
						{plugin.license}
					</span>
				{/if}
				{#if plugin.category}
					<Badge variant="outline">{plugin.category}</Badge>
				{/if}
				{#each plugin.tags as tag (tag)}
					<a href={`/plugins?tag=${encodeURIComponent(tag)}`} class="text-xs hover:text-foreground">
						#{tag}
					</a>
				{/each}
			</div>
			<div class="flex flex-wrap items-center gap-2 text-sm">
				{#if plugin.homepage}
					<Button variant="outline" size="sm" href={plugin.homepage} target="_blank" rel="noreferrer">
						<ExternalLink class="h-3 w-3" />
						Repository
					</Button>
				{/if}
				{#if plugin.documentationUrl}
					<Button variant="outline" size="sm" href={plugin.documentationUrl} target="_blank" rel="noreferrer">
						<BookOpen class="h-3 w-3" />
						Docs
					</Button>
				{/if}
				{#if plugin.issuesUrl}
					<Button variant="outline" size="sm" href={plugin.issuesUrl} target="_blank" rel="noreferrer">
						<Bug class="h-3 w-3" />
						Report issue
					</Button>
				{/if}
				{#if plugin.supportEmail}
					<Button variant="outline" size="sm" href={`mailto:${plugin.supportEmail}`}>
						<Mail class="h-3 w-3" />
						Email support
					</Button>
				{/if}
			</div>
		</header>

		<section class="space-y-3">
			<div>
				<h2 class="text-xl font-semibold tracking-tight">Install</h2>
				<p class="text-sm text-muted-foreground">Resolve the latest platform-matching asset URL via the catalog API:</p>
			</div>
			<div class="relative rounded-lg border border-border bg-card font-mono text-xs">
				<pre class="overflow-x-auto px-4 py-3 leading-relaxed">{installCommand}</pre>
				<button
					type="button"
					class="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
					onclick={copyInstall}
				>
					<Copy class="h-3 w-3" />
					Copy
				</button>
			</div>
		</section>

		{#if plugin.screenshots.length > 0}
			<section class="space-y-3">
				<h2 class="text-xl font-semibold tracking-tight">Screenshots</h2>
				<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
					{#each plugin.screenshots as shot, i (shot.url)}
						<button
							type="button"
							class="aspect-video rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors"
							onclick={() => (activeScreenshot = i)}
						>
							<img src={shot.url} alt={shot.alt ?? shot.caption ?? plugin.name} class="h-full w-full object-cover" loading="lazy" />
						</button>
					{/each}
				</div>
			</section>
		{/if}

		{#if plugin.readmeHtml}
			<section class="space-y-3">
				<h2 class="text-xl font-semibold tracking-tight">README</h2>
				<article class="prose prose-sm dark:prose-invert max-w-none rounded-lg border border-border bg-card p-6">
					{@html plugin.readmeHtml}
				</article>
			</section>
		{/if}

		{#if sortedReleases.length > 0}
			<section class="space-y-3">
				<div>
					<h2 class="text-xl font-semibold tracking-tight">Releases</h2>
					<p class="text-sm text-muted-foreground">Latest version is highlighted in the badge above. SHA256 column shows when integrity has been hashed.</p>
				</div>
				<div class="rounded-lg border border-border overflow-hidden">
					<table class="w-full text-sm">
						<thead class="border-b border-border bg-card/50">
							<tr class="text-left">
								<th class="font-medium text-foreground px-4 py-2.5">Version</th>
								<th class="font-medium text-foreground px-4 py-2.5">Min runtime</th>
								<th class="font-medium text-foreground px-4 py-2.5">Platforms</th>
								<th class="font-medium text-foreground px-4 py-2.5">Size</th>
								<th class="font-medium text-foreground px-4 py-2.5">Released</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedReleases as release (release.id)}
								{@const sizes = Object.values(release.assets).map((a) => a.size ?? 0).filter((s) => s > 0)}
								{@const totalSize = sizes.reduce((a, b) => a + b, 0)}
								<tr class="border-b border-border/50 last:border-0">
									<td class="px-4 py-2.5 font-mono text-xs">{release.version}</td>
									<td class="px-4 py-2.5 text-muted-foreground">{release.minRuntimeVersion ?? '—'}</td>
									<td class="px-4 py-2.5 text-muted-foreground text-xs">
										{Object.keys(release.assets).join(', ') || '—'}
									</td>
									<td class="px-4 py-2.5 text-muted-foreground text-xs">{formatBytes(totalSize)}</td>
									<td class="px-4 py-2.5 text-muted-foreground">
										{new Date(release.createdAt).toLocaleDateString()}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{/if}
</div>

{#if activeScreenshot !== null && plugin && plugin.screenshots[activeScreenshot]}
	<button
		type="button"
		class="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-8"
		onclick={() => (activeScreenshot = null)}
		aria-label="Close"
	>
		<img
			src={plugin.screenshots[activeScreenshot].url}
			alt={plugin.screenshots[activeScreenshot].alt ?? ''}
			class="max-h-full max-w-full rounded-lg shadow-2xl"
		/>
	</button>
{/if}
