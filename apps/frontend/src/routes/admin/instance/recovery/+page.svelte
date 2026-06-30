<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { m } from '$lib/paraglide/messages'
	import Recovery from '../tabs/Recovery.svelte'
</script>

<AdminPageHeader title={m.admin_instance_tab_recovery()} subtitle={m.admin_instance_recovery_subtitle()} icon={KeyRound} />

<Recovery />
