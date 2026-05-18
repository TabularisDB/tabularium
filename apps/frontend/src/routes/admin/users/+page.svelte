<script lang="ts">
	import { onMount } from 'svelte'
	import Pencil from '@lucide/svelte/icons/pencil'
	import X from '@lucide/svelte/icons/x'
	import Badge from '$components/ui/Badge.svelte'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Input from '$components/ui/Input.svelte'
	import Label from '$components/ui/Label.svelte'
	import Select from '$components/ui/Select.svelte'
	import { eden } from '$lib/eden'
	import { toast } from 'svelte-sonner'
	import type { AdminUser } from '$lib/types'
	import { m } from '$lib/paraglide/messages'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'

	let users = $state<AdminUser[]>([])
	let loading = $state(true)
	let editing = $state<AdminUser | null>(null)
	let editName = $state('')
	let editRole = $state<'user' | 'admin'>('user')
	let saving = $state(false)

	async function load() {
		loading = true
		try {
			const { data, error } = await eden.api.admin.users.get()
			if (error) throw error
			users = (data as { users: AdminUser[] }).users
		} finally {
			loading = false
		}
	}

	onMount(load)

	function openEdit(u: AdminUser) {
		editing = u
		editName = u.displayName
		editRole = u.role
	}

	function closeEdit() {
		editing = null
	}

	async function quickSetRole(user: AdminUser, role: 'user' | 'admin') {
		try {
			const { error } = await eden.api.admin.users({ id: user.id }).patch({ role })
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_users_role_change({ name: user.displayName, role }))
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_users_update_failed())
		}
	}

	async function saveEdit() {
		if (!editing) return
		saving = true
		try {
			const patch: Record<string, unknown> = {}
			if (editName !== editing.displayName) patch.displayName = editName
			if (editRole !== editing.role) patch.role = editRole
			if (Object.keys(patch).length === 0) {
				closeEdit()
				return
			}
			const { error } = await eden.api.admin.users({ id: editing.id }).patch(patch)
			if (error)
				throw new Error(
					typeof error.value === 'string'
						? error.value
						: ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`),
				)
			toast.success(m.admin_users_updated())
			closeEdit()
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_users_update_failed())
		} finally {
			saving = false
		}
	}
</script>

<AdminPageHeader title={m.admin_users_title()} subtitle={m.admin_users_subtitle()} />

<Card>
	<CardHeader>
		<CardTitle class="text-base">{m.admin_users_registered()}</CardTitle>
		<CardDescription>{m.admin_users_total({ count: users.length })}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-2">
		{#if loading}
			<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
		{:else if users.length === 0}
			<p class="text-sm text-muted-foreground">{m.admin_users_empty()}</p>
		{:else}
			{#each users as u (u.id)}
				<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3">
					<div class="space-y-0.5 min-w-0 flex-1">
						<div class="text-sm font-medium truncate">{u.displayName}</div>
						<div class="text-xs text-muted-foreground font-mono truncate">{u.id}</div>
					</div>
					<div class="flex items-center gap-2 flex-shrink-0">
						<Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
						{#if u.role === 'admin'}
							<Button variant="ghost" size="sm" onclick={() => quickSetRole(u, 'user')}>{m.admin_users_demote()}</Button
							>
						{:else}
							<Button variant="ghost" size="sm" onclick={() => quickSetRole(u, 'admin')}
								>{m.admin_users_promote()}</Button
							>
						{/if}
						<Button variant="ghost" size="sm" onclick={() => openEdit(u)} aria-label={m.common_edit()}>
							<Pencil class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		{/if}
	</CardContent>
</Card>

{#if editing}
	<div
		class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6"
		role="dialog"
		aria-modal="true"
	>
		<button type="button" class="absolute inset-0" onclick={closeEdit} aria-label={m.common_close()}></button>
		<div class="relative w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl space-y-5">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="text-lg font-semibold tracking-tight">{m.admin_users_edit_title()}</h2>
					<p class="text-xs text-muted-foreground font-mono">{editing.id}</p>
				</div>
				<button
					type="button"
					onclick={closeEdit}
					class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
					aria-label={m.common_close()}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="space-y-2">
				<Label for="edit-name">{m.admin_users_display_name()}</Label>
				<Input id="edit-name" bind:value={editName} maxlength={60} />
			</div>
			<div class="space-y-2">
				<Label for="edit-role">{m.admin_users_role()}</Label>
				<Select id="edit-role" bind:value={editRole}>
					<option value="user">{m.admin_users_role_user()}</option>
					<option value="admin">{m.admin_users_role_admin()}</option>
				</Select>
			</div>
			<div class="flex justify-end gap-2 pt-2">
				<Button variant="outline" size="sm" onclick={closeEdit} disabled={saving}>{m.common_cancel()}</Button>
				<Button size="sm" onclick={saveEdit} disabled={saving}>{saving ? m.common_saving() : m.common_save()}</Button>
			</div>
		</div>
	</div>
{/if}
