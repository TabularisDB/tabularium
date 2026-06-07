/**
 * Plugins the Tabularium kernel marks as required for the instance.
 *
 * These IDs are always merged into the load set at boot, regardless of whether
 * `infra.plugins.enabled` includes them. Admins cannot disable required
 * plugins via the enabled list — the kernel re-adds them every boot.
 *
 * Two sources contribute to the required set:
 *
 * 1. `CORE_REQUIRED_PLUGINS` — hardcoded in the kernel. Tabularium-the-product
 *    sets this for plugins it cannot run without. Forks can edit this constant
 *    to harden their own deployment.
 *
 * 2. `infra.plugins.required` setting — operator-controlled JSON `string[]`.
 *    Admins set this for plugins their specific deployment depends on (e.g. a
 *    storage plugin that backs custom workflows). Read at boot, merged into the
 *    load set, surfaced via `GET /api/plugin-contributions`.
 *
 * Required plugins still go through the same `requires`-aware ensureLoaded
 * pipeline, so their own transitive deps auto-seed normally.
 */
export const CORE_REQUIRED_PLUGINS: readonly string[] = []

export const REQUIRED_SETTING_KEY = 'infra.plugins.required'
