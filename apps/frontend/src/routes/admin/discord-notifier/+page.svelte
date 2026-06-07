<script lang="ts">
	import Component from '@tabularium/plugin-discord-notifier/frontend/admin/Settings.svelte'
	import type { ComponentProps } from 'svelte'
	let { data } = $props()
</script>

<Component data={data as ComponentProps<typeof Component>['data']} />
