import { defineRelations } from 'drizzle-orm'
import * as schema from './schema.mysql'

export const relations = defineRelations(schema, (r) => ({
  users: {
    identities: r.many.identities(),
    plugins: r.many.plugins(),
  },
  rootCredentials: {},
  providerInstances: {},
  identities: {
    user: r.one.users({ from: r.identities.userId, to: r.users.id }),
    instance: r.one.providerInstances({ from: r.identities.providerInstanceId, to: r.providerInstances.id }),
  },
  plugins: {
    owner: r.one.users({ from: r.plugins.ownerId, to: r.users.id }),
    releases: r.many.releases(),
  },
  releases: {
    plugin: r.one.plugins({ from: r.releases.pluginId, to: r.plugins.id }),
  },
  pluginRequests: {
    votes: r.many.pluginRequestVotes(),
    claims: r.many.pluginRequestClaims(),
  },
  pluginRequestVotes: {
    request: r.one.pluginRequests({ from: r.pluginRequestVotes.requestId, to: r.pluginRequests.id }),
    user: r.one.users({ from: r.pluginRequestVotes.userId, to: r.users.id }),
  },
  pluginRequestClaims: {
    request: r.one.pluginRequests({ from: r.pluginRequestClaims.requestId, to: r.pluginRequests.id }),
    user: r.one.users({ from: r.pluginRequestClaims.userId, to: r.users.id }),
  },
  settings: {},
  markdownPages: {},
  pluginTransfers: {
    plugin: r.one.plugins({ from: r.pluginTransfers.pluginId, to: r.plugins.id }),
    from: r.one.users({ from: r.pluginTransfers.fromUserId, to: r.users.id, alias: 'from' }),
    to: r.one.users({ from: r.pluginTransfers.toUserId, to: r.users.id, alias: 'to' }),
  },
  auditLog: {},
}))
