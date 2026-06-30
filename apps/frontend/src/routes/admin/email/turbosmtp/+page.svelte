<script lang="ts">
	import Component from '@tabularium/plugin-turbosmtp/frontend/admin/TurboSettings.svelte'
	import type { ComponentProps } from 'svelte'
	let { data } = $props()
</script>

<Component data={data as ComponentProps<typeof Component>['data']} />
