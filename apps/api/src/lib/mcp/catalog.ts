import { t, type Elysia } from 'elysia'
import type { TSchema } from '@sinclair/typebox'
import { adminScope } from '$lib/access'

const groups: Record<string, string[]> = {
  'catalog:read': [
    'listPlugins',
    'getPlugin',
    'getPluginStats',
    'getPluginDownloadStats',
    'getReleaseIntegrity',
    'listRequests',
    'listKinds',
    'listPages',
    'getPage',
    'getPageByPath',
    'getPluginDocs',
    'getManifestSpec',
    'validateManifest',
    'getInstanceInfo',
    'getFeatures',
    'getBranding',
    'getStats',
    'getHomeCopy',
    'getI18nConfig',
    'listProviders',
  ],
  'account:read': ['getMe', 'listTransfers', 'listSubmittableRepos'],
  'plugins:write': [
    'publishRelease',
    'submitPreview',
    'submitOAuth',
    'deletePlugin',
    'initiateTransfer',
    'respondTransfer',
    'authorRefreshPluginManifest',
    'authorRehashRelease',
    'authorYankRelease',
  ],
  'requests:write': ['createRequest', 'toggleRequestClaim', 'toggleUpvote'],
}
// Explicit allowlist: new REST endpoints are never exposed automatically.
const adminOperations = new Set([
  'adminGetDocsConfig',
  'adminUpdateDocsConfig',
  'adminListDocsSections',
  'adminCreateDocsSection',
  'adminUpdateDocsSection',
  'adminDeleteDocsSection',
  'adminDiagnostics',
  'getManifestExtensions',
  'updateManifestExtensions',
  'adminGetHomeCopy',
  'adminUpdateHomeCopy',
  'adminDeleteRequest',
  'listUsers',
  'getUser',
  'patchUser',
  'listSettings',
  'getSetting',
  'putSetting',
  'deleteSetting',
  'listProviderInstances',
  'createProviderInstance',
  'getProviderInstance',
  'patchProviderInstance',
  'deleteProviderInstance',
  'testProviderOAuth',
  'bulkProviderInstanceAction',
  'adminListPlugins',
  'updatePlugin',
  'adminDeletePlugin',
  'rehashRelease',
  'refreshPluginManifest',
  'replayWebhook',
  'bulkPluginAction',
  'adminListPages',
  'createPage',
  'adminGetPage',
  'adminListPageTranslations',
  'updatePage',
  'deletePage',
  'previewPage',
  'adminListKinds',
  'adminCreateKind',
  'adminGetKind',
  'adminUpdateKind',
  'adminDeleteKind',
  'getInstanceSettings',
  'updateInstanceSettings',
  'listAppUrlSchemes',
  'replaceAppUrlSchemes',
  'getInstanceSecurity',
  'rotateInstanceSigningKey',
  'getInfraCache',
  'updateInfraCache',
  'getInfraStorage',
  'updateInfraStorage',
  'adminGetI18n',
  'adminUpdateI18n',
  'adminGetFeatures',
  'adminUpdateFeatures',
  'getAdminBranding',
  'updateBranding',
  'listAudit',
])
export type ToolRoute = {
  name: string
  description: string
  path: string
  method: string
  scope: string
  schema: TSchema
  readOnly: boolean
}
export function toolCatalog(app: Pick<Elysia, 'routes'>): ToolRoute[] {
  const result: ToolRoute[] = []
  for (const route of app.routes) {
    const id = route.hooks.detail?.operationId as string | undefined
    if (!id) continue
    const scope = adminOperations.has(id)
      ? adminScope(route.path, route.method)
      : Object.entries(groups).find(([, ids]) => ids.includes(id))?.[0]
    if (!scope) continue
    const properties: Record<string, TSchema> = {}
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = route.hooks[key]
      if (!schema) continue
      if (typeof schema !== 'object') throw new Error(`MCP needs an inline ${key} schema: ${id}`)
      const input = schema as TSchema
      properties[key] = key === 'query' && !input.required?.length ? t.Optional(input) : input
    }
    result.push({
      name: id
        .replace(/OAuth/g, 'Oauth')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase(),
      description: `${route.hooks.detail?.summary ?? id}. Required permission: ${scope}.`,
      path: route.path,
      method: route.method,
      scope,
      schema: t.Object(properties, { additionalProperties: false }),
      readOnly: route.method === 'GET' || ['validateManifest', 'submitPreview', 'previewPage'].includes(id),
    })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}
