<script lang="ts">
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import Settings from '@lucide/svelte/icons/settings'
	import Gauge from '@lucide/svelte/icons/gauge'
	import FileCode2 from '@lucide/svelte/icons/file-code-2'
	import KeyRound from '@lucide/svelte/icons/key-round'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import TabBar from '$components/admin/TabBar.svelte'
	import { m } from '$lib/paraglide/messages'
	import General from './tabs/General.svelte'
	import RateLimits from './tabs/RateLimits.svelte'
	import Manifest from './tabs/Manifest.svelte'
	import Recovery from './tabs/Recovery.svelte'

	type TabId = 'general' | 'rate-limits' | 'manifest' | 'recovery'

	const VALID: TabId[] = ['general', 'rate-limits', 'manifest', 'recovery']

	function fromUrl(): TabId {
		const t = page.url.searchParams.get('tab') as TabId | null
		return t && VALID.includes(t) ? t : 'general'
	}

	let active = $state<TabId>(fromUrl())

	$effect(() => {
		const t = fromUrl()
		if (t !== active) active = t
	})

	function onChange(id: TabId) {
		const url = new URL(page.url)
		if (id === 'general') url.searchParams.delete('tab')
		else url.searchParams.set('tab', id)
		goto(`${url.pathname}${url.search}`, { replaceState: true, keepFocus: true, noScroll: true })
	}

	const tabs = $derived([
		{ id: 'general' as const, label: m.admin_instance_tab_general(), icon: Settings },
		{ id: 'rate-limits' as const, label: m.admin_instance_tab_rate_limits(), icon: Gauge },
		{ id: 'manifest' as const, label: m.admin_instance_tab_manifest(), icon: FileCode2 },
		{ id: 'recovery' as const, label: m.admin_instance_tab_recovery(), icon: KeyRound },
	])
</script>

<AdminPageHeader title={m.admin_instance_title()} subtitle={m.admin_instance_subtitle()}>
	{#snippet actions()}
		<TabBar {tabs} bind:active {onChange} size="sm" />
	{/snippet}
</AdminPageHeader>

{#if active === 'general'}
	<General />
{:else if active === 'rate-limits'}
	<RateLimits />
{:else if active === 'manifest'}
	<Manifest />
{:else if active === 'recovery'}
	<Recovery />
{/if}
