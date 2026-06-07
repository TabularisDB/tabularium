<script lang="ts">
	import Component from '@tabularium/plugin-email/frontend/user/EmailSettings.svelte'
	import type { ComponentProps } from 'svelte'
	let { data } = $props()
</script>

<Component data={data as ComponentProps<typeof Component>['data']} />
