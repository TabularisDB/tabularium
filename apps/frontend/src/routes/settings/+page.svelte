<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import Link2Off from '@lucide/svelte/icons/link-2-off'
	import LogOut from '@lucide/svelte/icons/log-out'
	import Trash2 from '@lucide/svelte/icons/trash-2'
	import Plus from '@lucide/svelte/icons/plus'
	import Check from '@lucide/svelte/icons/check'
	import X from '@lucide/svelte/icons/x'
	import UserRoundCog from '@lucide/svelte/icons/user-round-cog'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import { api } from '$lib/api'
	import { auth } from '$lib/stores/auth.svelte'
	import { toast } from 'svelte-sonner'
	import type { ProviderInfo } from '$lib/types'

	type Transfer = {
		id: string
		pluginId: string
		pluginName: string
		fromUserId: string
		fromName: string
		toUserId: string
		toName: string
		status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired'
		message: string | null
		createdAt: number
		expiresAt: number
		respondedAt: number | null
		direction: 'incoming' | 'outgoing'
	}

	let providers = $state<ProviderInfo[]>([])
	let transfers = $state<Transfer[]>([])

	async function loadTransfers() {
		try {
			const data = await api.get<{ transfers: Transfer[] }>('/auth/me/transfers')
			transfers = data.transfers
		} catch {
			transfers = []
		}
	}

	onMount(async () => {
		await auth.refresh()
		if (!auth.user) {
			goto('/login')
			return
		}
		const { providers: list } = await api.get<{ providers: ProviderInfo[] }>('/auth/providers').catch(() => ({ providers: [] }))
		providers = list
		await loadTransfers()
	})

	async function respond(transferId: string, action: 'accept' | 'reject' | 'cancel') {
		try {
			await api.post(`/auth/me/transfers/${transferId}`, { action })
			toast.success(`Transfer ${action}ed`)
			await loadTransfers()
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed')
		}
	}

	function relative(ts: number): string {
		const diff = ts - Date.now()
		const abs = Math.abs(diff)
		const minutes = Math.floor(abs / 60_000)
		if (minutes < 60) return diff < 0 ? `${minutes}m ago` : `in ${minutes}m`
		const hours = Math.floor(minutes / 60)
		if (hours < 24) return diff < 0 ? `${hours}h ago` : `in ${hours}h`
		const days = Math.floor(hours / 24)
		return diff < 0 ? `${days}d ago` : `in ${days}d`
	}

	const pendingTransfers = $derived(transfers.filter((t) => t.status === 'pending'))
	const historyTransfers = $derived(transfers.filter((t) => t.status !== 'pending').slice(0, 10))

	const linkedIds = $derived(new Set(auth.user?.identities.map((i) => i.providerInstanceId) ?? []))
	const unlinked = $derived(providers.filter((p) => !linkedIds.has(p.id)))

	async function unlink(identityId: string) {
		if (!confirm('Unlink this identity?')) return
		try {
			await api.delete(`/auth/me/identities/${identityId}`)
			await auth.refresh()
			toast.success('Identity unlinked')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to unlink')
		}
	}

	async function signOut() {
		try {
			await auth.logout()
			toast.success('Signed out')
			goto('/')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to sign out')
		}
	}

	async function deleteAccount() {
		if (!confirm('Permanently delete your account? This unlinks all identities. Plugins you own must be transferred or deleted first.')) return
		try {
			await api.delete('/auth/me')
			auth.clear()
			toast.success('Account deleted')
			goto('/')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to delete account')
		}
	}
</script>

<div class="mx-auto max-w-3xl px-6 py-12 space-y-10">
	<header class="space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">Settings</h1>
		<p class="text-muted-foreground">Manage your linked accounts.</p>
	</header>

	{#if auth.user}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Account</CardTitle>
				<CardDescription>Logged in as {auth.user.displayName}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-2 text-sm">
				<div class="flex items-center gap-2"><span class="text-muted-foreground w-24">User ID</span><code class="font-mono text-xs">{auth.user.id}</code></div>
				<div class="flex items-center gap-2">
					<span class="text-muted-foreground w-24">Role</span>
					<Badge variant={auth.user.role === 'admin' ? 'default' : 'secondary'}>{auth.user.role}</Badge>
				</div>
				<div class="pt-3 border-t border-border flex justify-end gap-2">
					<Button variant="destructive" size="sm" onclick={deleteAccount}>
						<Trash2 class="h-3.5 w-3.5" />
						Delete account
					</Button>
					<Button variant="outline" size="sm" onclick={signOut}>
						<LogOut class="h-3.5 w-3.5" />
						Sign out
					</Button>
				</div>
			</CardContent>
		</Card>

		{#if pendingTransfers.length > 0}
			<Card>
				<CardHeader>
					<CardTitle class="text-base flex items-center gap-2">
						<UserRoundCog class="h-4 w-4" />
						Pending transfers
					</CardTitle>
					<CardDescription>Plugins waiting for your response or that you've offered to others.</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3">
					{#each pendingTransfers as t (t.id)}
						<div class="rounded-md border border-border bg-card/50 px-4 py-3 space-y-2">
							<div class="flex items-center justify-between gap-3 flex-wrap">
								<div class="min-w-0 space-y-0.5">
									<div class="text-sm font-medium truncate">
										<a href={`/plugins/${t.pluginId}`} class="hover:text-primary">{t.pluginName}</a>
									</div>
									<div class="text-xs text-muted-foreground">
										{#if t.direction === 'incoming'}
											From <span class="text-foreground">{t.fromName}</span> · expires {relative(t.expiresAt)}
										{:else}
											To <span class="text-foreground">{t.toName}</span> · expires {relative(t.expiresAt)}
										{/if}
									</div>
								</div>
								<div class="flex items-center gap-1.5 flex-shrink-0">
									{#if t.direction === 'incoming'}
										<Button size="sm" onclick={() => respond(t.id, 'accept')}>
											<Check class="h-3.5 w-3.5" />
											Accept
										</Button>
										<Button size="sm" variant="outline" onclick={() => respond(t.id, 'reject')}>
											<X class="h-3.5 w-3.5" />
											Reject
										</Button>
									{:else}
										<Button size="sm" variant="ghost" onclick={() => respond(t.id, 'cancel')}>Cancel</Button>
									{/if}
								</div>
							</div>
							{#if t.message}
								<p class="text-xs text-muted-foreground italic">"{t.message}"</p>
							{/if}
						</div>
					{/each}
				</CardContent>
			</Card>
		{/if}

		<Card>
			<CardHeader>
				<CardTitle class="text-base">Linked identities</CardTitle>
				<CardDescription>OAuth accounts that can manage your plugins.</CardDescription>
			</CardHeader>
			<CardContent class="space-y-3">
				{#each auth.user.identities as id (id.id)}
					<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-4 py-3">
						<div class="space-y-0.5">
							<div class="text-sm font-medium">{id.providerDisplayName}</div>
							<div class="text-xs text-muted-foreground font-mono">{id.username}</div>
						</div>
						<Button variant="ghost" size="sm" onclick={() => unlink(id.id)}>
							<Link2Off class="h-3.5 w-3.5" />
							Unlink
						</Button>
					</div>
				{/each}

				{#if unlinked.length > 0}
					<div class="pt-3 border-t border-border space-y-2">
						<p class="text-xs text-muted-foreground uppercase tracking-wider">Link another</p>
						{#each unlinked as p (p.id)}
							<Button
								variant="outline"
								size="sm"
								class="w-full justify-start"
								onclick={() => (window.location.href = `/auth/${p.id}?link=1`)}
							>
								<Plus class="h-3.5 w-3.5" />
								Link {p.displayName}
							</Button>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
