<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Save from '@lucide/svelte/icons/save'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Button from '$components/ui/Button.svelte'
	import { eden } from '$lib/eden'

	type Features = { submissionsEnabled: boolean; requestsEnabled: boolean }

	let submissionsEnabled = $state(true)
	let requestsEnabled = $state(true)
	let loading = $state(true)
	let saving = $state(false)

	onMount(async () => {
		try {
			const { data, error } = await eden.api.admin.features.get()
			if (error) throw error
			const f = data as Features
			submissionsEnabled = f.submissionsEnabled
			requestsEnabled = f.requestsEnabled
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to load features')
		} finally {
			loading = false
		}
	})

	async function save() {
		saving = true
		try {
			const { error } = await eden.api.admin.features.patch({ submissionsEnabled, requestsEnabled })
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success('Features updated')
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to save')
		} finally {
			saving = false
		}
	}
</script>

<header class="space-y-1">
	<h1 class="text-2xl font-semibold tracking-tight">Features</h1>
	<p class="text-sm text-muted-foreground">Toggle public-facing capabilities. Disabled features hide their UI and return 403 from the API.</p>
</header>

{#if loading}
	<p class="text-sm text-muted-foreground">Loading…</p>
{:else}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">Plugin submissions</CardTitle>
			<CardDescription>
				When off, the <code class="font-mono">/submit</code> page hides the form and <code class="font-mono">POST /api/submit/oauth</code> returns 403. Existing plugins keep working — only new submissions are blocked.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<label class="flex items-center gap-2 cursor-pointer text-sm">
				<input type="checkbox" bind:checked={submissionsEnabled} class="h-4 w-4 rounded border-input" />
				<span>Allow new plugin submissions</span>
			</label>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">Plugin requests</CardTitle>
			<CardDescription>
				When off, the <code class="font-mono">/requests</code> page hides the create form and <code class="font-mono">POST /api/requests</code> returns 403. Existing requests stay listed and upvoting still works.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<label class="flex items-center gap-2 cursor-pointer text-sm">
				<input type="checkbox" bind:checked={requestsEnabled} class="h-4 w-4 rounded border-input" />
				<span>Allow new plugin requests</span>
			</label>
		</CardContent>
	</Card>

	<div class="flex justify-end">
		<Button size="sm" onclick={save} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? 'Saving…' : 'Apply'}
		</Button>
	</div>
{/if}
