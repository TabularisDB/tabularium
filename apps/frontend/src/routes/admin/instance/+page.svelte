<script lang="ts">
	import Settings from '@lucide/svelte/icons/settings'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { m } from '$lib/paraglide/messages'
	import General from './tabs/General.svelte'
</script>

<AdminPageHeader title={m.admin_instance_title()} subtitle={m.admin_instance_subtitle()} icon={Settings} />

<General />
