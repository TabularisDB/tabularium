<script lang="ts">
	import { onMount } from 'svelte'
	import { toast } from 'svelte-sonner'
	import Card from '$components/ui/Card.svelte'
	import CardContent from '$components/ui/CardContent.svelte'
	import CardDescription from '$components/ui/CardDescription.svelte'
	import CardHeader from '$components/ui/CardHeader.svelte'
	import CardTitle from '$components/ui/CardTitle.svelte'
	import Badge from '$components/ui/Badge.svelte'
	import StickySaveBar from '$components/admin/StickySaveBar.svelte'
	import { eden } from '$lib/eden'
	import { m } from '$lib/paraglide/messages'

	let requireApproval = $state(false)
	let initial = $state(false)
	let loading = $state(true)
	let saving = $state(false)

	const dirty = $derived(requireApproval !== initial)

	function extractError(error: unknown): string {
		const e = error as { value?: unknown; status?: number }
		if (typeof e.value === 'string') return e.value
		const v = e.value as { error?: string } | undefined
		return v?.error ?? `Request failed (${e.status ?? '?'})`
	}

	async function load() {
		try {
			const { data, error } = await eden.api.admin.instance.get()
			if (error) throw new Error(extractError(error))
			const res = data as { requireApproval: boolean }
			requireApproval = res.requireApproval
			initial = res.requireApproval
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_load_failed())
		} finally {
			loading = false
		}
	}

	async function save() {
		saving = true
		try {
			const { error } = await eden.api.admin.instance.put({ requireApproval })
			if (error) throw new Error(extractError(error))
			toast.success(m.admin_instance_saved())
			initial = requireApproval
		} catch (e) {
			toast.error(e instanceof Error ? e.message : m.admin_instance_save_failed())
		} finally {
			saving = false
		}
	}

	function discard() {
		requireApproval = initial
	}

	onMount(load)
</script>

<div class="space-y-6">
	<Card>
		<CardHeader>
			<CardTitle class="text-base flex items-center gap-2">
				{m.admin_instance_approval_title()}
				<Badge variant={requireApproval ? 'default' : 'secondary'}>
					{requireApproval ? m.admin_instance_approval_on() : m.admin_instance_approval_off()}
				</Badge>
			</CardTitle>
			<CardDescription>
				{m.admin_instance_approval_subtitle_prefix()} <code class="font-mono">pending</code>
				{m.admin_instance_approval_subtitle_middle()}
				<code class="font-mono">423</code>
				{m.admin_instance_approval_subtitle_suffix()}
				<a href="/admin/plugins" class="text-primary hover:underline">{m.admin_instance_plugins_link()}</a>.
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			{#if loading}
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			{:else}
				<label class="flex items-center gap-3 cursor-pointer select-none">
					<input type="checkbox" bind:checked={requireApproval} class="h-4 w-4 rounded border-input" />
					<span class="text-sm">{m.admin_instance_require_approval()}</span>
				</label>
			{/if}
		</CardContent>
	</Card>
</div>

<StickySaveBar {dirty} {saving} onSave={save} onDiscard={discard} />
