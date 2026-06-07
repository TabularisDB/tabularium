<script lang="ts">
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Send from '@lucide/svelte/icons/send'
	import Check from '@lucide/svelte/icons/check'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import type { DiscordNotifierSettings, DiscordNotifierLogPage, DiscordNotifierLogRow } from './Settings.load'

	type Props = { data: { settings: DiscordNotifierSettings; log: DiscordNotifierLogPage } }
	let { data }: Props = $props()

	const KNOWN_EVENTS = [
		{ id: 'plugin.approved', label: 'Plugin approved' },
		{ id: 'plugin.rejected', label: 'Plugin rejected' },
		{ id: 'account.welcome', label: 'New user signup' },
	] as const

	// svelte-ignore state_referenced_locally
	let settings = $state<DiscordNotifierSettings>(data.settings)
	let webhookUrlInput = $state('')
	let username = $state(data.settings.username ?? '')
	let enabledMap = $state<Record<string, boolean>>(
		Object.fromEntries(KNOWN_EVENTS.map((e) => [e.id, data.settings.enabledEvents.includes(e.id)])),
	)
	let log = $state<DiscordNotifierLogRow[]>(data.log.rows)
	let busy = $state(false)
	let testResult = $state<{ kind: 'ok' | 'err'; text: string } | null>(null)

	function selectedEvents(): string[] {
		return KNOWN_EVENTS.filter((e) => enabledMap[e.id]).map((e) => e.id)
	}

	async function errMsg(res: Response): Promise<string> {
		try {
			const j = await res.json()
			if (j && typeof j === 'object' && 'error' in j && typeof j.error === 'string') return j.error
			return `Request failed (${res.status})`
		} catch {
			return `Request failed (${res.status})`
		}
	}

	async function refresh() {
		const [s, l] = await Promise.all([
			fetch('/api/admin/discord-notifier/'),
			fetch('/api/admin/discord-notifier/log/?limit=10'),
		])
		if (s.ok) {
			const next = (await s.json()) as DiscordNotifierSettings
			settings = next
			username = next.username ?? ''
			enabledMap = Object.fromEntries(KNOWN_EVENTS.map((e) => [e.id, next.enabledEvents.includes(e.id)]))
			webhookUrlInput = ''
		}
		if (l.ok) {
			const page = (await l.json()) as DiscordNotifierLogPage
			log = page.rows
		}
	}

	async function save() {
		busy = true
		try {
			const body: { webhookUrl?: string; username?: string | null; enabledEvents: string[] } = {
				enabledEvents: selectedEvents(),
			}
			if (webhookUrlInput) body.webhookUrl = webhookUrlInput
			body.username = username || null
			const res = await fetch('/api/admin/discord-notifier/', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!res.ok) {
				toast.error(await errMsg(res))
				return
			}
			toast.success('Saved')
			await refresh()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Save failed')
		} finally {
			busy = false
		}
	}

	async function sendTest() {
		busy = true
		testResult = null
		try {
			const res = await fetch('/api/admin/discord-notifier/test/', { method: 'POST' })
			if (!res.ok) {
				testResult = { kind: 'err', text: await errMsg(res) }
				toast.error(await errMsg(res))
				return
			}
			const json = (await res.json()) as { ok: true; status: string; httpStatus: number }
			testResult = { kind: 'ok', text: `Sent (HTTP ${json.httpStatus})` }
			toast.success('Test message sent')
			await refresh()
		} catch (e) {
			testResult = { kind: 'err', text: e instanceof Error ? e.message : 'Send failed' }
			toast.error('Send failed')
		} finally {
			busy = false
		}
	}

	function fmtTs(ms: number): string {
		try {
			return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
		} catch {
			return String(ms)
		}
	}

	function statusClass(status: string): string {
		if (status === 'sent') return 'text-success'
		if (status === 'failed') return 'text-destructive'
		return 'text-muted-foreground'
	}
</script>

<AdminPageHeader
	title="Discord notifier"
	subtitle="Relay Tabularium lifecycle events (signups, plugin approvals, rejections) to a Discord channel via webhook."
/>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Webhook</CardTitle>
		<CardDescription>
			Paste a Discord webhook URL (Server Settings → Integrations → Webhooks). The URL is encrypted at rest and never
			returned over the API.
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3 max-w-xl">
		<div class="grid gap-2">
			<Label for="wh">Webhook URL</Label>
			<Input
				id="wh"
				type="password"
				bind:value={webhookUrlInput}
				placeholder={settings.webhookUrlSet
					? '••• stored — enter to replace'
					: 'https://discord.com/api/webhooks/...'}
				autocomplete="off"
			/>
			{#if settings.webhookUrlSet}
				<p class="text-xs text-success inline-flex items-center gap-1">
					<Check class="h-3 w-3" /> Stored — leave blank to keep
				</p>
			{/if}
		</div>
		<div class="grid gap-2">
			<Label for="un">Bot username (optional)</Label>
			<Input id="un" bind:value={username} placeholder="Tabularium" />
		</div>
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Events</CardTitle>
		<CardDescription>Pick which lifecycle events get relayed to Discord.</CardDescription>
	</CardHeader>
	<CardContent class="space-y-2">
		{#each KNOWN_EVENTS as ev (ev.id)}
			<label class="flex items-center gap-3 cursor-pointer select-none py-1">
				<input type="checkbox" bind:checked={enabledMap[ev.id]} class="h-4 w-4 rounded border-input" />
				<span class="text-sm">{ev.label}</span>
				<code class="text-xs text-muted-foreground">{ev.id}</code>
			</label>
		{/each}
		<div class="flex justify-end pt-2">
			<Button size="sm" onclick={save} disabled={busy}>
				<Save class="h-3.5 w-3.5" />
				Save settings
			</Button>
		</div>
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Test message</CardTitle>
		<CardDescription>Sends a single test message through the configured webhook to verify Discord receives it.</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3">
		<div class="flex items-center gap-3">
			<Button size="sm" onclick={sendTest} disabled={busy || !settings.webhookUrlSet}>
				<Send class="h-3.5 w-3.5" />
				Send test
			</Button>
			{#if !settings.webhookUrlSet}
				<span class="text-xs text-muted-foreground">Save a webhook URL first.</span>
			{/if}
		</div>
		{#if testResult}
			<div
				class={[
					'rounded-md border px-3 py-2 text-xs',
					testResult.kind === 'ok'
						? 'border-success/40 bg-success/10 text-success-foreground'
						: 'border-destructive/40 bg-destructive/10 text-destructive-foreground',
				].join(' ')}
			>
				{testResult.text}
			</div>
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Recent webhook log</CardTitle>
		<CardDescription>The last {log.length} webhook sends, most recent first.</CardDescription>
	</CardHeader>
	<CardContent>
		{#if log.length === 0}
			<p class="text-xs text-muted-foreground">No webhook sends yet.</p>
		{:else}
			<div class="space-y-1">
				{#each log as row (row.id)}
					<div class="flex items-start gap-3 text-xs py-1 border-b border-border/40">
						<span class={['font-mono', statusClass(row.status)].join(' ')}>{row.status}</span>
						<span class="font-mono text-muted-foreground">{row.event}</span>
						<span class="ml-auto text-muted-foreground">{fmtTs(row.sentAt)}</span>
						{#if row.httpStatus !== null}
							<span class="text-muted-foreground">HTTP {row.httpStatus}</span>
						{/if}
						{#if row.error}
							<span class="text-destructive truncate max-w-[20rem]" title={row.error}>{row.error}</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>
