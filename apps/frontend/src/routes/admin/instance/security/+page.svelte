<script lang="ts">
	import ShieldCheck from '@lucide/svelte/icons/shield-check'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { m } from '$lib/paraglide/messages'
	import Security from '../tabs/Security.svelte'
</script>

<AdminPageHeader title={m.admin_instance_tab_security()} subtitle={m.admin_instance_security_subtitle()} icon={ShieldCheck} />

<Security />
