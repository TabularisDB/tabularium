<script lang="ts">
	import { goto } from '$app/navigation'
	import { tick } from 'svelte'
	import ArrowRight from '@lucide/svelte/icons/arrow-right'
	import Boxes from '@lucide/svelte/icons/boxes'
	import Search from '@lucide/svelte/icons/search'
	import Loader2 from '@lucide/svelte/icons/loader-2'
	import X from '@lucide/svelte/icons/x'
	import VerifiedBadge from '$components/ui/VerifiedBadge.svelte'
	import { eden } from '$lib/eden'
	import { features } from '$lib/stores/features.svelte'
	import { instanceInfo } from '$lib/stores/instance-info.svelte'
	import { search } from '$lib/stores/search.svelte'
	import { m } from '$lib/paraglide/messages'
	import { cn } from '$lib/utils'
	import type { Plugin, PluginListResponse } from '$lib/types'

	// Command-palette search after tabularis.dev's SearchModal: ⌘K / Ctrl+K opens
	// it, results are plugins from the catalogue API.
	const RESULT_LIMIT = 8
	const DEBOUNCE_MS = 150
	const listId = 'site-search-results'

	let query = $state('')
	let results = $state<Plugin[]>([])
	let total = $state(0)
	let loading = $state(false)
	let active = $state(-1)
	let input = $state<HTMLInputElement | null>(null)
	let list = $state<HTMLUListElement | null>(null)
	let requestSeq = 0
	let timer: ReturnType<typeof setTimeout> | undefined

	const term = $derived(query.trim())

	const quickLinks = $derived(
		[
			{ href: '/plugins', label: m.nav_plugins(), show: true, reload: false },
			{ href: instanceInfo.docsExternalUrl ?? '/docs', label: m.nav_docs(), show: true, reload: false },
			{ href: '/docs/plugin-development', label: m.docs_plugin_dev_title(), show: true, reload: false },
			{ href: '/openapi', label: m.footer_openapi(), show: true, reload: true },
			{ href: '/requests', label: m.nav_requests(), show: features.requestsEnabled, reload: false },
			{ href: '/submit', label: m.nav_submit(), show: features.submissionsEnabled, reload: false },
		].filter((l) => l.show),
	)

	function resultsHref(q: string) {
		return q ? `/plugins?search=${encodeURIComponent(q)}` : '/plugins'
	}

	async function fetchResults(q: string) {
		const seq = ++requestSeq
		loading = true
		try {
			const { data, error } = await eden.api.plugins.get({ query: { search: q, limit: String(RESULT_LIMIT) } })
			if (error) throw error
			// Drop responses that arrive after a newer keystroke.
			if (seq !== requestSeq) return
			const res = data as PluginListResponse
			results = res.plugins
			total = res.total
		} catch {
			if (seq === requestSeq) results = []
		} finally {
			if (seq === requestSeq) loading = false
		}
	}

	function onInput() {
		active = -1
		clearTimeout(timer)
		if (!term) {
			results = []
			total = 0
			requestSeq++
			loading = false
			return
		}
		loading = true
		timer = setTimeout(() => fetchResults(term), DEBOUNCE_MS)
	}

	function close() {
		search.hide()
	}

	function go(href: string, reload = false) {
		close()
		if (reload) window.location.href = href
		else goto(href)
	}

	async function moveActive(next: number) {
		active = next
		await tick()
		list?.children[active]?.scrollIntoView({ block: 'nearest' })
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault()
			close()
			return
		}
		if (e.key === 'Enter') {
			e.preventDefault()
			if (active >= 0 && results[active]) go(`/plugins/${results[active].id}`)
			else if (term) go(resultsHref(term))
			return
		}
		if (!results.length) return
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			void moveActive((active + 1) % results.length)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			void moveActive(active <= 0 ? results.length - 1 : active - 1)
		}
	}

	function onGlobalKeydown(e: KeyboardEvent) {
		if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault()
			if (search.open) close()
			else search.show()
		}
	}

	// Fresh state + focus on every open, and no page scroll behind the overlay.
	$effect(() => {
		if (!search.open) return
		query = ''
		results = []
		total = 0
		active = -1
		void tick().then(() => input?.focus())
		const previous = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = previous
		}
	})
</script>

<svelte:window onkeydown={onGlobalKeydown} />

{#if search.open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[10vh] backdrop-blur-[2px] dark:bg-black/80"
		onclick={(e) => {
			if (e.target === e.currentTarget) close()
		}}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-label={m.search_label()}
			class="flex max-h-[70vh] w-full max-w-[560px] flex-col overflow-hidden rounded-lg border border-border bg-popover px-1 py-2 text-popover-foreground shadow-[0_20px_60px_rgba(0,0,0,0.5)] tabularis:rounded-md tabularis:border-[0.1rem]"
		>
			<div class="flex items-center gap-3 px-5 py-3">
				{#if loading}
					<Loader2 class="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
				{:else}
					<Search class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				{/if}
				<input
					bind:this={input}
					bind:value={query}
					oninput={onInput}
					onkeydown={onKeydown}
					type="text"
					placeholder={m.home_search_placeholder()}
					aria-label={m.home_search_placeholder()}
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={results.length > 0}
					aria-controls={listId}
					aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
					autocomplete="off"
					spellcheck="false"
					class="min-w-0 flex-1 border-0 bg-transparent text-[0.95rem] text-foreground placeholder:text-muted-foreground focus:outline-none"
				/>
				{#if query}
					<button
						type="button"
						onclick={() => {
							query = ''
							onInput()
							input?.focus()
						}}
						class="flex text-muted-foreground transition-colors hover:text-foreground"
						aria-label={m.common_clear()}
					>
						<X class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>

			{#if !term}
				<div class="px-5 py-3">
					<p class="section-label">{m.search_quick()}</p>
					<div class="flex flex-wrap gap-2">
						{#each quickLinks as link (link.href)}
							<button type="button" class="quick-chip" onclick={() => go(link.href, link.reload)}>
								{link.label}
							</button>
						{/each}
					</div>
				</div>
			{:else if results.length > 0}
				<p class="section-label px-5 pt-3">
					{total === 1 ? m.search_results_one() : m.search_results_count({ count: total })}
				</p>
				<ul bind:this={list} id={listId} role="listbox" class="overflow-y-auto p-2">
					{#each results as p, i (p.id)}
						<li id={`${listId}-${i}`} role="option" aria-selected={active === i}>
							<a
								href={`/plugins/${p.id}`}
								onclick={close}
								onmouseenter={() => (active = i)}
								class={cn(
									'flex items-center gap-3 rounded-md p-3 transition-colors',
									active === i && 'bg-foreground/5',
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
										<span class="truncate text-[0.9rem] font-medium text-foreground">{p.name}</span>
										{#if p.verified}<VerifiedBadge size="sm" verifiedAt={p.verifiedAt ?? null} />{/if}
									</span>
									<span class="mt-0.5 block truncate text-[0.8rem] text-muted-foreground">{p.description}</span>
								</span>
								<span class="flex shrink-0 flex-col items-end gap-1">
									{#if p.category}
										<span class="kind-badge">{p.category}</span>
									{/if}
									{#if p.latestVersion}
										<span class="font-mono text-[0.7rem] text-muted-foreground">v{p.latestVersion}</span>
									{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else if !loading}
				<div class="px-5 py-10 text-center text-[0.9rem] text-muted-foreground">
					<Search class="mx-auto mb-3 h-8 w-8 opacity-30" strokeWidth={1.5} />
					{m.home_search_empty({ query: term })}
				</div>
			{/if}

			<div class="flex items-center gap-4 px-5 pt-3 pb-1 text-xs text-muted-foreground">
				<span class="hint"><kbd>↑↓</kbd> {m.search_hint_navigate()}</span>
				<span class="hint"><kbd>↵</kbd> {m.search_hint_open()}</span>
				<span class="hint hidden sm:flex"><kbd>Esc</kbd> {m.search_hint_close()}</span>
				{#if term}
					<a
						href={resultsHref(term)}
						onclick={close}
						class="ml-auto inline-flex min-w-0 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
					>
						<span class="truncate">{m.home_search_see_all({ query: term })}</span>
						<ArrowRight class="h-3 w-3 shrink-0" />
					</a>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.section-label {
		margin-bottom: 0.75rem;
		font-size: 0.7rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-brand-accent);
	}

	.quick-chip {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		font-size: 0.85rem;
		color: var(--color-muted-foreground);
		cursor: pointer;
		transition:
			border-color 0.15s ease,
			color 0.15s ease;
	}
	.quick-chip:hover {
		border-color: var(--color-border-strong);
		color: var(--color-foreground);
	}

	/* Plugin colour from tabularis.dev search results. */
	.kind-badge {
		padding: 0.125rem 0.5rem;
		border: 1px solid #8b7cf6;
		border-radius: 999px;
		font-size: 0.7rem;
		color: #8b7cf6;
	}

	.hint {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.hint kbd {
		padding: 0.1rem 0.35rem;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--color-foreground) 6%, transparent);
		font-family: var(--font-mono);
	}
</style>
