<script lang="ts">
	import Rocket from '@lucide/svelte/icons/rocket'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { m } from '$lib/paraglide/messages'
	import AppHandoff from '../tabs/AppHandoff.svelte'
</script>

<AdminPageHeader title={m.admin_instance_tab_app_handoff()} subtitle={m.admin_instance_app_handoff_subtitle()} icon={Rocket} />

<AppHandoff />
