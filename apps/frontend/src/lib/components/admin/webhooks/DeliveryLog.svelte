<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import RefreshCw from '@lucide/svelte/icons/refresh-cw'
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
	import ChevronRight from '@lucide/svelte/icons/chevron-right'
	import Button from '$components/ui/Button.svelte'
	import { cn } from '$lib/utils'
	import { m } from '$lib/paraglide/messages'
	import { api, prettyBody, type DeliveryView } from './types'

	let { webhookId }: { webhookId: string } = $props()

	let deliveries = $state<DeliveryView[]>([])
	let next = $state<number | null>(null)
	let loading = $state(true)
	let expanded = $state<string | null>(null)
	let redelivering = $state<string | null>(null)

	async function load(more = false) {
		loading = true
		try {
			const qs = more && next ? `?before=${next}` : ''
			const data = await api<{ deliveries: DeliveryView[]; next: number | null }>(
				`/api/admin/webhooks/${encodeURIComponent(webhookId)}/deliveries${qs}`,
			)
			deliveries = more ? [...deliveries, ...data.deliveries] : data.deliveries
			next = data.next
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e))
		} finally {
			loading = false
		}
	}

	onMount(() => load())

	export function refresh() {
		return load()
	}

	async function redeliver(d: DeliveryView) {
		redelivering = d.id
		try {
			const { delivery } = await api<{ delivery: DeliveryView }>(
				`/api/admin/webhook-deliveries/${encodeURIComponent(d.id)}/redeliver`,
				{ method: 'POST' },
			)
			deliveries = [delivery, ...deliveries]
			expanded = delivery.id
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e))
		} finally {
			redelivering = null
		}
	}

	const statusLabel = (s: DeliveryView['status']) =>
		({
			success: m.admin_webhooks_status_success(),
			failed: m.admin_webhooks_status_failed(),
			pending: m.admin_webhooks_status_pending(),
			sending: m.admin_webhooks_status_sending(),
		})[s]

	const statusClass = (s: DeliveryView['status']) =>
		({
			success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
			failed: 'bg-destructive/15 text-destructive',
			pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
			sending: 'bg-primary/15 text-primary',
		})[s]
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between">
		<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{m.admin_webhooks_deliveries()}</p>
		<Button size="sm" variant="ghost" onclick={() => load()} disabled={loading} aria-label={m.admin_webhooks_refresh()}>
			<RefreshCw class={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
		</Button>
	</div>

	{#if !loading && deliveries.length === 0}
		<p class="text-sm text-muted-foreground">{m.admin_webhooks_deliveries_empty()}</p>
	{:else}
		<ul class="divide-y divide-border/60 rounded-md border border-border">
			{#each deliveries as d (d.id)}
				<li>
					<button
						type="button"
						class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent/40"
						onclick={() => (expanded = expanded === d.id ? null : d.id)}
						aria-expanded={expanded === d.id}
					>
						<ChevronRight
							class={cn('h-3.5 w-3.5 shrink-0 transition-transform', expanded === d.id && 'rotate-90')}
						/>
						<span class={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', statusClass(d.status))}>
							{statusLabel(d.status)}
						</span>
						<code class="min-w-0 truncate text-xs font-mono">{d.event}</code>
						<span class="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
							{#if d.lastStatusCode}<span class="font-mono">{d.lastStatusCode}</span>{/if}
							{#if d.durationMs !== null}<span class="hidden sm:inline">{d.durationMs} ms</span>{/if}
							<span class="hidden sm:inline">{new Date(d.createdAt).toLocaleString()}</span>
						</span>
					</button>
					{#if expanded === d.id}
						<div class="space-y-3 border-t border-border/60 bg-muted/20 px-3 py-3 text-xs">
							<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
								<span>{m.admin_webhooks_delivery_attempts({ count: d.attempts })}</span>
								{#if d.nextAttemptAt}
									<span>{m.admin_webhooks_delivery_next({ time: new Date(d.nextAttemptAt).toLocaleString() })}</span>
								{/if}
								<span class="sm:hidden">{new Date(d.createdAt).toLocaleString()}</span>
							</div>
							{#if d.lastError}
								<p class="rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-destructive">
									{d.lastError}
								</p>
							{/if}
							{#if d.request}
								<div class="space-y-1">
									<p class="font-medium">{m.admin_webhooks_delivery_request()}</p>
									<pre
										class="max-h-72 overflow-auto rounded border border-border bg-card p-2 font-mono text-[11px] leading-relaxed">{d.request.method} {d.request.url}
{#each Object.entries(d.request.headers) as [k, v]}{k}: {v}
{/each}
{prettyBody(d.request.body)}</pre>
								</div>
							{/if}
							{#if d.responseBody}
								<div class="space-y-1">
									<p class="font-medium">{m.admin_webhooks_delivery_response()}</p>
									<pre
										class="max-h-48 overflow-auto rounded border border-border bg-card p-2 font-mono text-[11px]">{prettyBody(
											d.responseBody,
										)}</pre>
								</div>
							{/if}
							<div class="flex justify-end">
								<Button size="sm" variant="outline" onclick={() => redeliver(d)} disabled={redelivering === d.id}>
									<RotateCcw class="h-3.5 w-3.5" />
									{m.admin_webhooks_redeliver()}
								</Button>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if next}
			<div class="flex justify-center">
				<Button size="sm" variant="ghost" onclick={() => load(true)} disabled={loading}>
					{m.admin_webhooks_load_more()}
				</Button>
			</div>
		{/if}
	{/if}
</div>
