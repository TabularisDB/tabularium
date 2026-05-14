<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon'
	import Sun from '@lucide/svelte/icons/sun'
	import Monitor from '@lucide/svelte/icons/monitor'
	import { userPrefersMode, setMode } from 'mode-watcher'
	import Button from '$components/ui/Button.svelte'

	function cycle() {
		const next = userPrefersMode.current === 'light'
			? 'dark'
			: userPrefersMode.current === 'dark'
				? 'system'
				: 'light'
		setMode(next)
	}

	const label = $derived(
		userPrefersMode.current === 'system'
			? 'Theme: system (click for light)'
			: userPrefersMode.current === 'dark'
				? 'Theme: dark (click for system)'
				: 'Theme: light (click for dark)',
	)
</script>

<Button variant="ghost" size="icon" aria-label={label} title={label} onclick={cycle}>
	{#if userPrefersMode.current === 'light'}
		<Sun class="h-4 w-4" />
	{:else if userPrefersMode.current === 'dark'}
		<Moon class="h-4 w-4" />
	{:else}
		<Monitor class="h-4 w-4" />
	{/if}
</Button>
