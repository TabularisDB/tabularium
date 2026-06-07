export { registry } from './registry'
export { bus } from './events'
export {
  initPlugins,
  listRequiredPlugins,
  __setLoaderForTests,
  __clearLoadedForTests,
  __seededByForTests,
} from './loader'
export { listContributions, __clearContributions } from './contributions'
export { listRoutes, __clearRoutes } from './route-collector'
export { buildHost } from './host'
export { resolvePluginLoader, listKnownPluginIds } from './resolver'
export {
  ensureInstalled,
  listInstalled,
  getInstalled,
  __clearInstallsForTests,
  __setInstallerRootsForTests,
  __resetInstallerRootsForTests,
  type InstalledPlugin,
  type PluginSource,
} from './installer'
export { CORE_REQUIRED_PLUGINS, REQUIRED_SETTING_KEY } from './required'
