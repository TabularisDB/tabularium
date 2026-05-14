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
	import { api } from '$lib/api'
	import { toast } from 'svelte-sonner'
	import type { AdminUser } from '$lib/types'

	let users = $state<AdminUser[]>([])
	let loading = $state(true)
	let editing = $state<AdminUser | null>(null)
	let editName = $state('')
	let editRole = $state<'user' | 'admin'>('user')
	let saving = $state(false)

	async function load() {
		loading = true
		try {
			const data = await api.get<{ users: AdminUser[] }>('/api/admin/users')
			users = data.users
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
			await api.patch(`/api/admin/users/${user.id}`, { role })
			toast.success(`${user.displayName} → ${role}`)
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Update failed')
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
			await api.patch(`/api/admin/users/${editing.id}`, patch)
			toast.success('User updated')
			closeEdit()
			await load()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to update')
		} finally {
			saving = false
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Users</h1>
	<p class="text-sm text-muted-foreground">Promote, demote, edit display name. Last-admin and self-demote are blocked server-side.</p>
</header>

<Card>
	<CardHeader>
		<CardTitle class="text-base">Registered users</CardTitle>
		<CardDescription>{users.length} total</CardDescription>
	</CardHeader>
	<CardContent class="space-y-2">
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if users.length === 0}
			<p class="text-sm text-muted-foreground">No users yet.</p>
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
							<Button variant="ghost" size="sm" onclick={() => quickSetRole(u, 'user')}>Demote</Button>
						{:else}
							<Button variant="ghost" size="sm" onclick={() => quickSetRole(u, 'admin')}>Promote</Button>
						{/if}
						<Button variant="ghost" size="sm" onclick={() => openEdit(u)} aria-label="Edit">
							<Pencil class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		{/if}
	</CardContent>
</Card>

{#if editing}
	<div class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true">
		<button type="button" class="absolute inset-0" onclick={closeEdit} aria-label="Close"></button>
		<div class="relative w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl space-y-5">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="text-lg font-semibold tracking-tight">Edit user</h2>
					<p class="text-xs text-muted-foreground font-mono">{editing.id}</p>
				</div>
				<button type="button" onclick={closeEdit} class="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" aria-label="Close">
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="space-y-2">
				<Label for="edit-name">Display name</Label>
				<Input id="edit-name" bind:value={editName} maxlength={60} />
			</div>
			<div class="space-y-2">
				<Label for="edit-role">Role</Label>
				<Select id="edit-role" bind:value={editRole}>
					<option value="user">user</option>
					<option value="admin">admin</option>
				</Select>
			</div>
			<div class="flex justify-end gap-2 pt-2">
				<Button variant="outline" size="sm" onclick={closeEdit} disabled={saving}>Cancel</Button>
				<Button size="sm" onclick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
			</div>
		</div>
	</div>
{/if}
