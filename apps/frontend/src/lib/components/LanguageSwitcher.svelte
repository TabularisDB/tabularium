<script lang="ts">
	import Languages from '@lucide/svelte/icons/languages'
	import { i18n, LOCALE_LABELS, type Locale } from '$lib/stores/i18n.svelte'

	function onChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value as Locale
		i18n.set(value)
	}
</script>

{#if i18n.enabledLocales.length > 1}
	<label class="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Language">
		<Languages class="h-3.5 w-3.5" />
		<select
			class="bg-transparent border-none focus:ring-0 cursor-pointer text-xs"
			value={i18n.current}
			onchange={onChange}
		>
			{#each i18n.enabledLocales as l (l)}
				<option value={l}>{LOCALE_LABELS[l] ?? l}</option>
			{/each}
		</select>
	</label>
{/if}
