import { beforeEach, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { db } from '../../src/db'
import { users } from '../../src/db/schema'
import { eq } from 'drizzle-orm'
import { clearDb, makeUser, makeAdmin, makePlugin, buildApp, type TestUser } from '../helpers'
import {
  registerClient,
  authorize,
  challenge,
  resourceUrl,
  exchangeCode,
  revokeGrant,
  verifyAccess,
} from '../../src/lib/oauth/server'

beforeEach(clearDb)
async function connect(scopes: string, user?: TestUser) {
  user ??= await makeUser()
  const app = await buildApp()
  const clientInfo = await registerClient({
    client_name: 'SDK integration test',
    redirect_uris: ['http://localhost/cb'],
  })
  const verifier = 'a'.repeat(64)
  const p = {
    client_id: clientInfo.client_id,
    redirect_uri: 'http://localhost/cb',
    resource: resourceUrl(),
    scope: scopes,
    response_type: 'code',
    code_challenge: challenge(verifier),
    code_challenge_method: 'S256',
  }
  const code = await authorize(p, {
    sub: user.id,
    username: user.username,
    identityId: user.identityId,
    providerInstanceId: 'github',
  })
  const token = await exchangeCode({ ...p, code, code_verifier: verifier })
  const client = new Client({ name: 'integration', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: async (input, init) => app.handle(new Request(input, init)),
      requestInit: { headers: { authorization: `Bearer ${token.access_token}` } },
    }),
  )
  return { client, token, user, app }
}
test('official SDK initializes, lists permitted tools and executes catalog/account reads', async () => {
  const { client, user } = await connect('catalog:read account:read')
  try {
    const { tools } = await client.listTools()
    expect(tools.some((t) => t.name === 'list_plugins')).toBe(true)
    expect(tools.some((t) => t.name === 'list_users')).toBe(false)
    expect(tools.some((t) => t.name === 'create_admin_token')).toBe(false)
    const me = await client.callTool({ name: 'get_me', arguments: {} })
    expect(me.isError).toBe(false)
    expect((me.structuredContent as { data: { id: string } }).data.id).toBe(user.id)
    const plugins = await client.callTool({ name: 'list_plugins', arguments: { query: { limit: '2' } } })
    expect(plugins.isError).toBe(false)
    const denied = await client.callTool({ name: 'list_users', arguments: {} })
    expect(denied.isError).toBe(true)
  } finally {
    await client.close()
  }
})
test('MCP writes preserve ownership and reject malformed paths', async () => {
  const owner = await makeUser()
  await makePlugin(owner.id)
  const { client } = await connect('plugins:write')
  try {
    const result = await client.callTool({ name: 'delete_plugin', arguments: { params: { slug: 'test-plugin' } } })
    expect(result.isError).toBe(true)
    expect((result.structuredContent as { status: number }).status).toBe(403)
    await expect(client.callTool({ name: 'delete_plugin', arguments: { params: { slug: '..' } } })).rejects.toThrow()
    expect(await db.query.plugins.findFirst({ where: { id: 'test-plugin' } })).toBeDefined()
  } finally {
    await client.close()
  }
})
test('admin tools recheck live role, scope and grant revocation', async () => {
  const admin = await makeAdmin()
  const { client, token } = await connect('admin:users:read', admin)
  try {
    expect((await client.callTool({ name: 'list_users', arguments: {} })).isError).toBe(false)
    expect(
      (
        await client.callTool({
          name: 'patch_user',
          arguments: { params: { id: admin.id }, body: { displayName: 'Changed' } },
        })
      ).isError,
    ).toBe(true)
    await db.update(users).set({ role: 'user' }).where(eq(users.id, admin.id))
    expect((await client.callTool({ name: 'list_users', arguments: {} })).isError).toBe(true)
    expect((await client.listTools()).tools).toHaveLength(0)
    const access = (await verifyAccess(token.access_token))!
    await revokeGrant(admin.id, access.grantId)
    const res = await (await buildApp()).handle(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { authorization: `Bearer ${token.access_token}` },
      }),
    )
    expect(res.status).toBe(401)
  } finally {
    await client.close()
  }
})
test('admin mutations execute as the user and are audited with OAuth client', async () => {
  const admin = await makeAdmin()
  const target = await makeUser()
  const { client } = await connect('admin:users:write', admin)
  try {
    const result = await client.callTool({
      name: 'patch_user',
      arguments: { params: { id: target.id }, body: { displayName: 'Updated via MCP' } },
    })
    expect(result.isError).toBe(false)
    expect((await db.query.users.findFirst({ where: { id: target.id } }))?.displayName).toBe('Updated via MCP')
    const audit = await db.query.auditLog.findFirst({ where: { action: 'mcp.patch_user' } })
    expect(audit?.actorId).toBe(admin.id)
    expect(audit?.meta).toContain('clientId')
  } finally {
    await client.close()
  }
})
test('MCP rejects hostile origins', async () => {
  const app = await buildApp()
  const res = await app.handle(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  expect(res.status).toBe(403)
})
test('delegated publish uses publisher ownership policy without minting a token', async () => {
  const owner = await makeUser()
  await makePlugin(owner.id)
  const { client } = await connect('plugins:write')
  try {
    const result = await client.callTool({
      name: 'publish_release',
      arguments: { params: { slug: 'test-plugin' }, body: { manifest: 'invalid', version: '1.0.0', assets: [] } },
    })
    expect(result.isError).toBe(true)
    expect((result.structuredContent as { status: number }).status).toBe(403)
  } finally {
    await client.close()
  }
})
test('settings read scope cannot disclose encrypted signing keys or arbitrary encrypted values', async () => {
  const { setSetting } = await import('../../src/lib/settings')
  const admin = await makeAdmin()
  await setSetting('registry.signing_key.private', 'private-key-material', { encrypted: true })
  await setSetting('custom.sensitive', 'another-secret', { encrypted: true })
  const { client } = await connect('admin:settings:read', admin)
  try {
    for (const key of ['registry.signing_key.private', 'custom.sensitive']) {
      const result = await client.callTool({ name: 'get_setting', arguments: { params: { key } } })
      expect(result.isError).toBe(false)
      expect((result.structuredContent as { data: { value: unknown; encrypted: boolean } }).data).toMatchObject({
        value: null,
        encrypted: true,
      })
    }
  } finally {
    await client.close()
  }
})
