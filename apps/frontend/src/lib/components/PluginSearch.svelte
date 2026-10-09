<script lang="ts">
	import { goto } from '$app/navigation'
	import ArrowRight from '@lucide/svelte/icons/arrow-right'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Search from '@lucide/svelte/icons/search'
	import Loader2 from '@lucide/svelte/icons/loader-2'
	import Button from '$components/ui/Button.svelte'
	import VerifiedBadge from '$components/ui/VerifiedBadge.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'
	import { cn } from '$lib/utils'
	import type { Plugin, PluginListResponse } from '$lib/types'

	let { class: className }: { class?: string } = $props()

	const SUGGESTION_LIMIT = 5
	const DEBOUNCE_MS = 180
	const MIN_CHARS = 2
	const listId = `plugin-search-${Math.random().toString(36).slice(2, 8)}`

	let query = $state('')
	let suggestions = $state<Plugin[]>([])
	let total = $state(0)
	let open = $state(false)
	let loading = $state(false)
	// -1 = the input itself; suggestions.length = the "see all results" row.
	let active = $state(-1)
	let requestSeq = 0
	let timer: ReturnType<typeof setTimeout> | undefined

	const term = $derived(query.trim())
	const showPanel = $derived(open && term.length >= MIN_CHARS)

	function resultsHref(q: string) {
		return q ? `/plugins?search=${encodeURIComponent(q)}` : '/plugins'
	}

	async function fetchSuggestions(q: string) {
		const seq = ++requestSeq
		loading = true
		try {
			const { data, error } = await eden.api.plugins.get({ query: { search: q, limit: String(SUGGESTION_LIMIT) } })
			if (error) throw error
			// Drop responses that arrive after a newer keystroke.
			if (seq !== requestSeq) return
			const res = data as PluginListResponse
			suggestions = res.plugins
			total = res.total
		} catch {
			if (seq === requestSeq) suggestions = []
		} finally {
			if (seq === requestSeq) loading = false
		}
	}

	function onInput() {
		open = true
		active = -1
		clearTimeout(timer)
		if (term.length < MIN_CHARS) {
			suggestions = []
			requestSeq++
			loading = false
			return
		}
		timer = setTimeout(() => fetchSuggestions(term), DEBOUNCE_MS)
	}

	function submit(e: SubmitEvent) {
		e.preventDefault()
		const picked = active >= 0 && active < suggestions.length ? suggestions[active] : null
		open = false
		goto(picked ? `/plugins/${picked.id}` : resultsHref(term))
	}

	function onKeydown(e: KeyboardEvent) {
		if (!showPanel) return
		const last = suggestions.length // the "see all" row
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			active = active >= last ? -1 : active + 1
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			active = active <= -1 ? last : active - 1
		} else if (e.key === 'Escape') {
			open = false
			active = -1
		} else if (e.key === 'Enter' && active === last) {
			e.preventDefault()
			open = false
			goto(resultsHref(term))
		}
	}

	function onFocusOut(e: FocusEvent) {
		// Keep the panel while focus moves into it (clicking a suggestion).
		const next = e.relatedTarget as Node | null
		if (next && (e.currentTarget as HTMLElement).contains(next)) return
		open = false
	}
</script>

<form onsubmit={submit} role="search" class={cn('relative', className)} onfocusout={onFocusOut}>
	<div
		class={cn(
			'flex items-center gap-2 rounded-lg border border-border bg-card/80 p-1.5 pl-4 shadow-sm backdrop-blur transition-colors focus-within:border-primary/60',
			'tabularis:rounded-md tabularis:border-[0.1rem] tabularis:shadow-none',
			showPanel && 'border-primary/60',
		)}
	>
		{#if loading}
			<Loader2 class="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
		{:else}
			<Search class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
		{/if}
		<input
			type="search"
			bind:value={query}
			oninput={onInput}
			onkeydown={onKeydown}
			onfocus={() => (open = true)}
			placeholder={m.home_search_placeholder()}
			aria-label={m.home_search_placeholder()}
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={showPanel}
			aria-controls={listId}
			aria-activedescendant={showPanel && active >= 0 ? `${listId}-${active}` : undefined}
			autocomplete="off"
			spellcheck="false"
			class="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
		/>
		<Button type="submit">
			{m.home_search_button()}
			<ArrowRight class="h-4 w-4" />
		</Button>
	</div>

	{#if showPanel}
		<div
			class="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-lg border border-border bg-popover text-left shadow-xl tabularis:rounded-md tabularis:border-[0.1rem]"
		>
			<ul id={listId} role="listbox" class="max-h-[22rem] overflow-y-auto p-1.5 pb-0">
				{#each suggestions as p, i (p.id)}
					<li id={`${listId}-${i}`} role="option" aria-selected={active === i}>
						<a
							href={`/plugins/${p.id}`}
							onmouseenter={() => (active = i)}
							onclick={() => (open = false)}
							class={cn(
								'flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors',
								active === i ? 'bg-accent text-foreground' : 'text-foreground/90',
							)}
						>
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background text-primary"
							>
								{#if p.iconUrl}
									<img src={p.iconUrl} alt="" class="h-7 w-7 object-contain" loading="lazy" />
								{:else}
									<Boxes class="h-4 w-4" />
								{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-1.5">
									<span class="truncate text-sm font-medium">{p.name}</span>
									{#if p.verified}<VerifiedBadge size="sm" verifiedAt={p.verifiedAt ?? null} />{/if}
								</span>
								<span class="block truncate text-xs text-muted-foreground">{p.description}</span>
							</span>
							{#if p.latestVersion}
								<span class="shrink-0 font-mono text-[10px] text-muted-foreground">v{p.latestVersion}</span>
							{/if}
						</a>
					</li>
				{:else}
					{#if !loading}
						<li class="px-3 py-6 text-center text-sm text-muted-foreground">{m.home_search_empty({ query: term })}</li>
					{/if}
				{/each}
			</ul>
			<div id={`${listId}-${suggestions.length}`} class="p-1.5 pt-0">
				<a
					href={resultsHref(term)}
					onmouseenter={() => (active = suggestions.length)}
					onclick={() => (open = false)}
					class={cn(
						'flex items-center justify-between gap-2 rounded-md border-t border-border px-2.5 py-2.5 text-xs transition-colors',
						active === suggestions.length ? 'bg-accent text-foreground' : 'text-muted-foreground',
					)}
				>
					<span>{m.home_search_see_all({ query: term })}</span>
					<span class="inline-flex items-center gap-1.5">
						{#if total > 0}<span class="font-mono">{total}</span>{/if}
						<ArrowRight class="h-3.5 w-3.5" />
					</span>
				</a>
			</div>
		</div>
	{/if}
</form>
