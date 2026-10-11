<script lang="ts">
	import { cn, isPrerelease } from '$lib/utils'
	import Badge from '$components/ui/Badge.svelte'
	import VerifiedBadge from '$components/ui/VerifiedBadge.svelte'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Download from '@lucide/svelte/icons/download'
	import { formatDownloadCount } from '$lib/downloads'
	import { i18n } from '$lib/stores/i18n.svelte'
	import { m } from '$lib/paraglide/messages'
	import type { Plugin } from '$lib/types'

	let { plugin, class: className }: { plugin: Plugin; class?: string } = $props()
	const author = $derived(plugin.author.split('<')[0].trim())
</script>

<a
	href={`/plugins/${plugin.id}`}
	class={cn(
		'group flex h-full min-w-0 flex-col rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40',
		'tabularis:rounded-md tabularis:border-[0.1rem] tabularis:hover:border-brand-accent/50',
		className,
	)}
>
	<div class="space-y-1.5">
		<div class="flex min-w-0 items-center gap-3">
			<div
				class="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center overflow-hidden flex-shrink-0"
			>
				{#if plugin.iconUrl}
					<img
						src={plugin.iconUrl}
						alt={plugin.name}
						class="h-10 w-10 object-contain"
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<Boxes class="h-5 w-5" />
				{/if}
			</div>
			<div class="flex min-w-0 flex-1 items-center gap-1.5">
				<h3
					class="min-w-0 truncate font-semibold tracking-tight group-hover:text-primary transition-colors tabularis:text-[1.1rem] tabularis:font-medium tabularis:tracking-normal tabularis:group-hover:text-brand-accent"
					title={plugin.name}
				>
					{plugin.name}
				</h3>
				{#if plugin.verified}
					<VerifiedBadge size="sm" verifiedAt={plugin.verifiedAt ?? null} class="shrink-0" />
				{/if}
			</div>
		</div>
		<div class="flex min-h-7 min-w-0 items-center gap-1.5">
			{#if plugin.latestVersion}
				<span
					class="min-w-0 truncate font-mono text-[10px] font-medium text-secondary-foreground tabularis:text-[0.7rem]"
					title={`v${plugin.latestVersion}`}>v{plugin.latestVersion}</span
				>
				{#if isPrerelease(plugin.latestVersion)}
					<Badge
						variant="secondary"
						class="shrink-0 whitespace-nowrap font-mono text-[10px] bg-warning/15 text-warning border-warning/30"
						>{m.plugin_prerelease_badge()}</Badge
					>
				{/if}
			{/if}
		</div>
		<p class="min-h-[2lh] text-sm text-muted-foreground line-clamp-2 [overflow-wrap:anywhere]">
			{plugin.description}
		</p>
	</div>
	<div class="mt-auto space-y-2 pt-4 text-xs text-muted-foreground">
		{#if plugin.category || plugin.license}
			<div class="flex min-w-0 items-center gap-2">
				{#if plugin.category}
					<Badge variant="outline" class="min-w-0 max-w-full text-[10px]">
						<span class="truncate" title={plugin.category}>{plugin.category}</span>
					</Badge>
				{/if}
				{#if plugin.license}
					<span class="min-w-0 truncate font-mono text-[10px]" title={plugin.license}>{plugin.license}</span>
				{/if}
			</div>
		{/if}
		<div class="flex min-w-0 items-center justify-between gap-2">
			<span class="min-w-0 truncate" title={author}>{author}</span>
			<span
				class="inline-flex shrink-0 items-center gap-1 font-mono tabular-nums"
				title={`${m.plugin_detail_stat_downloads()}: ${formatDownloadCount(plugin.downloads, i18n.current, false)}`}
				aria-label={`${m.plugin_detail_stat_downloads()}: ${formatDownloadCount(plugin.downloads, i18n.current, false)}`}
			>
				<Download class="h-3.5 w-3.5" aria-hidden="true" />
				{formatDownloadCount(plugin.downloads, i18n.current)}
			</span>
		</div>
	</div>
</a>
