<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Pencil from '@lucide/svelte/icons/pencil'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Send from '@lucide/svelte/icons/send'
	import History from '@lucide/svelte/icons/history'
	import Webhook from '@lucide/svelte/icons/webhook'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import Button from '$components/ui/Button.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import EmptyState from '$components/admin/EmptyState.svelte'
	import WebhookEditor from '$components/admin/webhooks/WebhookEditor.svelte'
	import DeliveryLog from '$components/admin/webhooks/DeliveryLog.svelte'
	import { api, type DeliveryView, type WebhookMeta, type WebhookView } from '$components/admin/webhooks/types'
	import { cn } from '$lib/utils'
	import { m } from '$lib/paraglide/messages'

	const PRIVATE_KEY = 'webhooks.allow_private_targets'

	let webhooks = $state<WebhookView[]>([])
	let meta = $state<WebhookMeta | null>(null)
	let loading = $state(true)
	// 'new' | webhook id | null
	let editing = $state<string | null>(null)
	let logsOpen = $state<string | null>(null)
	let testing = $state<string | null>(null)
	let allowPrivate = $state(false)
	let logs = $state<Record<string, DeliveryLog>>({})

	async function load() {
		loading = true
		try {
			const [list, presets] = await Promise.all([
				api<{ webhooks: WebhookView[] }>('/api/admin/webhooks'),
				api<WebhookMeta>('/api/admin/webhooks/presets'),
			])
			webhooks = list.webhooks
			meta = presets
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_webhooks_load_failed())
		} finally {
			loading = false
		}
		try {
			const s = await api<{ value: string | null }>(`/api/admin/settings/${PRIVATE_KEY}`)
			allowPrivate = s.value === '1'
		} catch {
			// 404 = never set = disallowed
		}
	}

	onMount(load)

	function onSaved(saved: WebhookView) {
		const i = webhooks.findIndex((w) => w.id === saved.id)
		webhooks = i === -1 ? [saved, ...webhooks] : webhooks.map((w) => (w.id === saved.id ? saved : w))
		editing = null
	}

	async function toggleEnabled(w: WebhookView) {
		try {
			const { webhook } = await api<{ webhook: WebhookView }>(`/api/admin/webhooks/${encodeURIComponent(w.id)}`, {
				method: 'PATCH',
				body: JSON.stringify({ enabled: !w.enabled }),
			})
			onSaved(webhook)
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_webhooks_save_failed())
		}
	}

	async function remove(w: WebhookView) {
		if (!confirm(m.admin_webhooks_delete_confirm({ name: w.name }))) return
		try {
			await api(`/api/admin/webhooks/${encodeURIComponent(w.id)}`, { method: 'DELETE' })
			webhooks = webhooks.filter((x) => x.id !== w.id)
			if (editing === w.id) editing = null
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_webhooks_delete_failed())
		}
	}

	async function sendTest(w: WebhookView) {
		testing = w.id
		try {
			const { delivery } = await api<{ delivery: DeliveryView | null }>(
				`/api/admin/webhooks/${encodeURIComponent(w.id)}/test`,
				{ method: 'POST', body: JSON.stringify({}) },
			)
			if (delivery?.status === 'success') {
				toast.success(m.admin_webhooks_test_ok({ status: String(delivery.lastStatusCode ?? '') }))
			} else {
				toast.error(m.admin_webhooks_test_failed({ error: delivery?.lastError ?? '?' }))
			}
			if (logsOpen === w.id) await logs[w.id]?.refresh()
			else logsOpen = w.id
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e))
		} finally {
			testing = null
		}
	}

	async function setAllowPrivate(next: boolean) {
		try {
			await api(`/api/admin/settings/${PRIVATE_KEY}`, {
				method: 'PUT',
				body: JSON.stringify({ value: next ? '1' : '0' }),
			})
			allowPrivate = next
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e))
		}
	}

	function presetLabel(key: string | null) {
		return meta?.presets.find((p) => p.key === key)?.label ?? null
	}
</script>

<AdminPageHeader title={m.admin_webhooks_title()} subtitle={m.admin_webhooks_subtitle()} icon={Webhook}>
	{#snippet actions()}
		{#if meta && editing !== 'new'}
			<Button size="sm" onclick={() => (editing = 'new')}>
				<Plus class="h-3.5 w-3.5" />
				{m.admin_webhooks_new()}
			</Button>
		{/if}
	{/snippet}
</AdminPageHeader>

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else if meta}
	{#if editing === 'new'}
		<WebhookEditor webhook={null} {meta} {onSaved} onCancel={() => (editing = null)} />
	{/if}

	{#if webhooks.length === 0 && editing !== 'new'}
		<EmptyState icon={Webhook} title={m.admin_webhooks_empty_title()} body={m.admin_webhooks_empty_body()}>
			{#snippet actions()}
				<Button size="sm" onclick={() => (editing = 'new')}>
					<Plus class="h-3.5 w-3.5" />
					{m.admin_webhooks_new()}
				</Button>
			{/snippet}
		</EmptyState>
	{/if}

	{#each webhooks as w (w.id)}
		{#if editing === w.id}
			<WebhookEditor webhook={w} {meta} {onSaved} onCancel={() => (editing = null)} />
		{:else}
			<Card>
				<CardContent class="space-y-4 pt-6">
					<div class="flex flex-wrap items-start gap-3">
						<div class="min-w-0 flex-1 space-y-1">
							<div class="flex flex-wrap items-center gap-2">
								<p class={cn('font-medium', !w.enabled && 'text-muted-foreground')}>{w.name}</p>
								{#if presetLabel(w.preset)}<Badge variant="outline">{presetLabel(w.preset)}</Badge>{/if}
								{#if !w.enabled}<Badge variant="secondary">{m.admin_webhooks_disabled()}</Badge>{/if}
							</div>
							<p class="truncate font-mono text-xs text-muted-foreground">{w.method} {w.url}</p>
							<p class="text-xs text-muted-foreground">
								{w.events.includes('*')
									? m.admin_webhooks_all_events()
									: w.events.length <= 3
										? w.events.join(', ')
										: m.admin_webhooks_events_count({ count: w.events.length })}
							</p>
						</div>
						<div class="flex flex-wrap items-center gap-1">
							<label class="mr-2 flex items-center gap-2 text-xs cursor-pointer">
								<input
									type="checkbox"
									checked={w.enabled}
									onchange={() => toggleEnabled(w)}
									class="h-4 w-4 rounded border-input"
								/>
								{m.admin_webhooks_enabled()}
							</label>
							<Button size="sm" variant="outline" onclick={() => sendTest(w)} disabled={testing === w.id}>
								<Send class="h-3.5 w-3.5" />
								{m.admin_webhooks_test()}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onclick={() => (logsOpen = logsOpen === w.id ? null : w.id)}
								aria-expanded={logsOpen === w.id}
							>
								<History class="h-3.5 w-3.5" />
								{m.admin_webhooks_deliveries()}
							</Button>
							<Button size="icon" variant="ghost" onclick={() => (editing = w.id)} aria-label={m.common_edit()}>
								<Pencil class="h-3.5 w-3.5" />
							</Button>
							<Button size="icon" variant="ghost" onclick={() => remove(w)} aria-label={m.common_delete()}>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
						</div>
					</div>
					{#if logsOpen === w.id}
						<DeliveryLog webhookId={w.id} bind:this={logs[w.id]} />
					{/if}
				</CardContent>
			</Card>
		{/if}
	{/each}

	<Card>
		<CardContent class="pt-6">
			<label class="flex items-start gap-3 text-sm cursor-pointer">
				<input
					type="checkbox"
					checked={allowPrivate}
					onchange={(e) => setAllowPrivate(e.currentTarget.checked)}
					class="mt-0.5 h-4 w-4 rounded border-input"
				/>
				<span class="space-y-0.5">
					<span class="block font-medium">{m.admin_webhooks_private_targets()}</span>
					<span class="block text-xs text-muted-foreground">{m.admin_webhooks_private_targets_hint()}</span>
				</span>
			</label>
		</CardContent>
	</Card>
{/if}
