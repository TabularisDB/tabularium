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
export { CORE_REQUIRED_PLUGINS, REQUIRED_SETTING_KEY } from './required'
