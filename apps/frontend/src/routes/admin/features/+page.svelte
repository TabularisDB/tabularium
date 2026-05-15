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
	import { m } from '$lib/paraglide/messages'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'

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
			toast.error(e instanceof Error ? e.message : m.admin_features_load_failed())
		} finally {
			loading = false
		}
	})

	async function save() {
		saving = true
		try {
			const { error } = await eden.api.admin.features.patch({ submissionsEnabled, requestsEnabled })
			if (error) throw new Error(typeof error.value === 'string' ? error.value : ((error.value as { error?: string })?.error ?? `Request failed (${error.status})`))
			toast.success(m.admin_features_updated())
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_branding_save_failed())
		} finally {
			saving = false
		}
	}
</script>

<AdminPageHeader title={m.admin_features_title()} subtitle={m.admin_features_subtitle()} />

{#if loading}
	<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
{:else}
	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_features_submissions()}</CardTitle>
			<CardDescription>
				{m.admin_features_submissions_subtitle_prefix()} <code class="font-mono">/submit</code> {m.admin_features_submissions_subtitle_middle()} <code class="font-mono">POST /api/submit/oauth</code> {m.admin_features_submissions_subtitle_suffix()}
			</CardDescription>
		</CardHeader>
		<CardContent>
			<label class="flex items-center gap-2 cursor-pointer text-sm">
				<input type="checkbox" bind:checked={submissionsEnabled} class="h-4 w-4 rounded border-input" />
				<span>{m.admin_features_allow_submissions()}</span>
			</label>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="text-base">{m.admin_features_requests()}</CardTitle>
			<CardDescription>
				{m.admin_features_requests_subtitle_prefix()} <code class="font-mono">/requests</code> {m.admin_features_requests_subtitle_middle()} <code class="font-mono">POST /api/requests</code> {m.admin_features_requests_subtitle_suffix()}
			</CardDescription>
		</CardHeader>
		<CardContent>
			<label class="flex items-center gap-2 cursor-pointer text-sm">
				<input type="checkbox" bind:checked={requestsEnabled} class="h-4 w-4 rounded border-input" />
				<span>{m.admin_features_allow_requests()}</span>
			</label>
		</CardContent>
	</Card>

	<div class="flex justify-end">
		<Button size="sm" onclick={save} disabled={saving}>
			<Save class="h-3.5 w-3.5" />
			{saving ? m.common_saving() : m.common_apply()}
		</Button>
	</div>
{/if}
