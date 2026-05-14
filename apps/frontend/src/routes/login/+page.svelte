<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import Button from '$components/ui/Button.svelte'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import ProviderIcon from '$components/brand/ProviderIcon.svelte'
	import { eden } from '$lib/eden'
	import type { InitStatus, ProviderInfo } from '$lib/types'

	let providers = $state<ProviderInfo[] | null>(null)

	onMount(async () => {
		const statusRes = await eden.api.init.status.get()
		const status = (statusRes.data ?? null) as InitStatus | null
		if (status?.requiresInit) {
			goto('/init')
			return
		}
		const providersRes = await eden.auth.providers.get()
		const list = ((providersRes.data ?? { providers: [] }) as { providers: ProviderInfo[] }).providers
		providers = list
	})
</script>

<div class="mx-auto max-w-md px-6 py-20 space-y-8">
	<div class="text-center space-y-2">
		<h1 class="text-3xl font-semibold tracking-tight">Sign in</h1>
		<p class="text-sm text-muted-foreground">Sign in to submit plugins and upvote requests.</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Choose a provider</CardTitle>
			<CardDescription>Configured on this instance:</CardDescription>
		</CardHeader>
		<CardContent class="space-y-3">
			{#if providers === null}
				<p class="text-sm text-muted-foreground">Loading…</p>
			{:else if providers.length === 0}
				<p class="text-sm text-muted-foreground">No sign-in providers are configured on this instance yet.</p>
			{:else}
				{#each providers as p (p.id)}
					<Button
						class="w-full justify-start"
						variant="outline"
						onclick={() => (window.location.href = `/auth/${p.id}`)}
					>
						<ProviderIcon kind={p.kind} baseUrl={p.baseUrl} logoUrl={p.logoUrl} class="h-4 w-4" />
						Continue with {p.displayName}
					</Button>
				{/each}
			{/if}
		</CardContent>
	</Card>

	<p class="text-xs text-muted-foreground text-center">
		Tokens are encrypted at rest. We only see your username and an access token used to verify repository ownership when you
		submit a plugin.
	</p>
</div>
