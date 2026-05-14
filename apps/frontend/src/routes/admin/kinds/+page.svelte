<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Plus from '@lucide/svelte/icons/plus'
	import Save from '@lucide/svelte/icons/save'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import Input from '$components/ui/Input.svelte'
	import { eden } from '$lib/eden'
	import type { Kind } from '$lib/types'
	import { m } from '$lib/paraglide/messages'

	let kinds = $state<Kind[]>([])
	let loading = $state(true)
	let newKey = $state('')
	let newLabel = $state('')
	let newDescription = $state('')
	let creating = $state(false)
	let savingKey = $state<string | null>(null)

	onMount(loadKinds)

	async function loadKinds() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.kinds.get()
			if (error) throw error
			kinds = (data as { kinds: Kind[] }).kinds
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_kinds_load_failed())
		} finally {
			loading = false
		}
	}

	async function addKind() {
		if (!newKey.trim() || !newLabel.trim()) return
		creating = true
		try {
			const { error } = await eden.api.admin.kinds.post({
				key: newKey.trim(),
				label: newLabel.trim(),
				description: newDescription.trim() || null,
			})
			if (error) {
				if (error.status === 409) {
					toast.error(m.admin_kinds_duplicate())
				} else {
					const msg = typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? m.admin_kinds_save_failed())
					toast.error(msg)
				}
				return
			}
			toast.success(m.admin_kinds_created())
			newKey = ''
			newLabel = ''
			newDescription = ''
			await loadKinds()
		} finally {
			creating = false
		}
	}

	async function saveKind(k: Kind) {
		savingKey = k.key
		try {
			const { error } = await eden.api.admin.kinds({ key: k.key }).put({
				key: k.key,
				label: k.label,
				description: k.description,
			})
			if (error) {
				const msg = typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? m.admin_kinds_save_failed())
				toast.error(msg)
				return
			}
			toast.success(m.admin_kinds_updated())
		} finally {
			savingKey = null
		}
	}

	async function deleteKind(k: Kind) {
		if (!confirm(m.admin_kinds_delete_confirm())) return
		try {
			const { error } = await eden.api.admin.kinds({ key: k.key }).delete()
			if (error) {
				const msg = typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? m.admin_kinds_save_failed())
				toast.error(msg)
				return
			}
			toast.success(m.admin_kinds_deleted())
			await loadKinds()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_kinds_save_failed())
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">{m.admin_kinds_title()}</h1>
	<p class="text-sm text-muted-foreground">{m.admin_kinds_subtitle()}</p>
</header>

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	{#if kinds.length === 0}
		<p class="text-sm text-muted-foreground italic">{m.admin_kinds_empty()}</p>
	{:else}
		<div class="space-y-3">
			{#each kinds as k (k.key)}
				<Card>
					<CardHeader>
						<CardTitle class="text-base font-mono">{k.key}</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<label class="block space-y-1">
							<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_label()}</span>
							<Input bind:value={k.label} />
						</label>
						<label class="block space-y-1">
							<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_description()}</span>
							<Input value={k.description ?? ''} oninput={(e) => (k.description = (e.currentTarget as HTMLInputElement).value)} />
						</label>
						<div class="flex gap-2 justify-end">
							<Button size="sm" variant="outline" onclick={() => deleteKind(k)}>
								<Trash2 class="h-3.5 w-3.5" />
								{m.admin_kinds_delete_button()}
							</Button>
							<Button size="sm" onclick={() => saveKind(k)} disabled={savingKey === k.key}>
								<Save class="h-3.5 w-3.5" />
								{savingKey === k.key ? m.common_saving() : m.common_apply()}
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_kinds_add_heading()}</CardTitle>
			<CardDescription>{m.admin_kinds_field_key_hint()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_key()}</span>
				<Input bind:value={newKey} placeholder="theme" />
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_label()}</span>
				<Input bind:value={newLabel} placeholder="Themes" />
			</label>
			<label class="block space-y-1">
				<span class="text-xs font-medium text-muted-foreground">{m.admin_kinds_field_description()}</span>
				<Input bind:value={newDescription} />
			</label>
			<div class="flex justify-end">
				<Button size="sm" onclick={addKind} disabled={creating || !newKey.trim() || !newLabel.trim()}>
					<Plus class="h-3.5 w-3.5" />
					{m.admin_kinds_add_button()}
				</Button>
			</div>
		</CardContent>
	</Card>
{/if}
