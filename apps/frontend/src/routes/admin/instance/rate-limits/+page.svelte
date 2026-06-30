<script lang="ts">
	import Gauge from '@lucide/svelte/icons/gauge'
	import AdminPageHeader from '$components/admin/AdminPageHeader.svelte'
	import { m } from '$lib/paraglide/messages'
	import RateLimits from '../tabs/RateLimits.svelte'
</script>

<AdminPageHeader title={m.admin_instance_tab_rate_limits()} subtitle={m.admin_instance_rate_limits_subtitle()} icon={Gauge} />

<RateLimits />
