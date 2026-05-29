<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Copy from '@lucide/svelte/icons/copy'
	import Check from '@lucide/svelte/icons/check'
	import KeyRound from '@lucide/svelte/icons/key-round'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { m } from '$lib/paraglide/messages'

	type TokenRow = {
		id: string
		name: string
		prefix: string
		scopes: string[] | null
		expiresAt: number | null
		lastUsedAt: number | null
		createdAt: number
		revokedAt: number | null
	}

	let tokens = $state<TokenRow[]>([])
	let loading = $state(true)
	let creating = $state(false)
	let newName = $state('')
	let justCreated = $state<{ token: string; id: string } | null>(null)
	let copied = $state(false)

	async function load() {
		loading = true
		try {
			const res = await fetch('/api/admin/tokens', { credentials: 'include' })
			if (!res.ok) throw new Error(`Load failed: ${res.status}`)
			const data = (await res.json()) as { tokens: TokenRow[] }
			tokens = data.tokens
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_tokens_load_failed())
		} finally {
			loading = false
		}
	}

	onMount(load)

	async function createToken() {
		const name = newName.trim()
		if (!name) return
		creating = true
		try {
			const res = await fetch('/api/admin/tokens', {
				method: 'POST',
				credentials: 'include',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name }),
			})
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as { error?: string } | null
				throw new Error(data?.error ?? `Create failed: ${res.status}`)
			}
			const data = (await res.json()) as { token: string; row: TokenRow }
			justCreated = { token: data.token, id: data.row.id }
			tokens = [data.row, ...tokens]
			newName = ''
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_tokens_create_failed())
		} finally {
			creating = false
		}
	}

	async function copyToken() {
		if (!justCreated) return
		try {
			await navigator.clipboard.writeText(justCreated.token)
			copied = true
			setTimeout(() => (copied = false), 1500)
		} catch {
			toast.error(m.admin_tokens_copy_failed())
		}
	}

	async function revoke(row: TokenRow) {
		if (!confirm(m.admin_tokens_revoke_confirm({ name: row.name }))) return
		try {
			const res = await fetch(`/api/admin/tokens/${encodeURIComponent(row.id)}`, {
				method: 'DELETE',
				credentials: 'include',
			})
			if (!res.ok) throw new Error(`Revoke failed: ${res.status}`)
			tokens = tokens.filter((t) => t.id !== row.id)
			if (justCreated?.id === row.id) justCreated = null
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_tokens_revoke_failed())
		}
	}

	function fmtDate(ts: number | null): string {
		if (!ts) return '—'
		return new Date(ts).toLocaleString()
	}
</script>

<AdminPageHeader title={m.admin_tokens_title()} subtitle={m.admin_tokens_subtitle()} />

<Card>
	<CardHeader>
		<CardTitle class="text-base flex items-center gap-2">
			<KeyRound class="h-4 w-4" />
			{m.admin_tokens_create_heading()}
		</CardTitle>
		<CardDescription>{m.admin_tokens_create_note()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-3">
		<div class="grid gap-1.5">
			<Label for="tok-name">{m.admin_tokens_field_name()}</Label>
			<Input
				id="tok-name"
				bind:value={newName}
				placeholder={m.admin_tokens_name_placeholder()}
				maxlength={80}
				onkeydown={(e) => e.key === 'Enter' && createToken()}
			/>
		</div>
		<div class="flex justify-end">
			<Button size="sm" onclick={createToken} disabled={creating || !newName.trim()}>
				<Plus class="h-3.5 w-3.5" />
				{creating ? m.common_saving() : m.admin_tokens_create_button()}
			</Button>
		</div>
		{#if justCreated}
			<div class="rounded-md border border-amber-500/60 bg-amber-500/10 p-3 space-y-2">
				<p class="text-xs font-medium">{m.admin_tokens_shown_once_warning()}</p>
				<div class="flex items-center gap-2">
					<code class="flex-1 truncate rounded bg-card border border-border px-2 py-1.5 text-xs font-mono">
						{justCreated.token}
					</code>
					<Button size="sm" variant="outline" onclick={copyToken}>
						{#if copied}
							<Check class="h-3.5 w-3.5 text-emerald-500" />
							{m.admin_tokens_copied()}
						{:else}
							<Copy class="h-3.5 w-3.5" />
							{m.admin_tokens_copy()}
						{/if}
					</Button>
				</div>
				<p class="text-[10px] text-muted-foreground">
					{m.admin_tokens_usage_hint()}
				</p>
			</div>
		{/if}
	</CardContent>
</Card>

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_tokens_list_heading()}</CardTitle>
		<CardDescription>{m.admin_tokens_list_note()}</CardDescription>
	</CardHeader>
	<CardContent>
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if tokens.length === 0}
			<p class="text-sm text-muted-foreground">{m.admin_tokens_empty()}</p>
		{:else}
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
						<th class="py-2 pr-3 font-medium">{m.admin_tokens_col_name()}</th>
						<th class="py-2 pr-3 font-medium">{m.admin_tokens_col_prefix()}</th>
						<th class="py-2 pr-3 font-medium">{m.admin_tokens_col_last_used()}</th>
						<th class="py-2 pr-3 font-medium">{m.admin_tokens_col_created()}</th>
						<th class="py-2"></th>
					</tr>
				</thead>
				<tbody>
					{#each tokens as t (t.id)}
						<tr class="border-b border-border/50 last:border-0">
							<td class="py-2 pr-3">{t.name}</td>
							<td class="py-2 pr-3"><code class="text-xs font-mono">{t.prefix}…</code></td>
							<td class="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(t.lastUsedAt)}</td>
							<td class="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(t.createdAt)}</td>
							<td class="py-2 text-right">
								<Button size="sm" variant="ghost" onclick={() => revoke(t)}>
									<Trash2 class="h-3.5 w-3.5" />
									{m.admin_tokens_revoke()}
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</CardContent>
</Card>
