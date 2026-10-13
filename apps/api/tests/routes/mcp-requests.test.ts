import { beforeEach, expect, spyOn, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ulid } from 'ulid'
import { db } from '../../src/db'
import { pluginRequests } from '../../src/db/schema'
import { clearDb, makeUser, makeAdmin, buildApp, type TestUser } from '../helpers'
import { registerClient, authorize, challenge, resourceUrl, exchangeCode } from '../../src/lib/oauth/server'

beforeEach(clearDb)

async function connect(scopes: string, user: TestUser) {
  const app = await buildApp()
  const clientInfo = await registerClient({ client_name: 'MCP requests test', redirect_uris: ['http://localhost/cb'] })
  const verifier = 'b'.repeat(64)
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
  return client
}

async function seed(requester: TestUser, overrides: Partial<typeof pluginRequests.$inferInsert> = {}) {
  const row = {
    id: ulid(),
    slug: 'firebird',
    name: 'Firebird',
    description: 'Firebird driver',
    kind: 'driver',
    requesterId: requester.id,
    ...overrides,
  }
  await db.insert(pluginRequests).values(row)
  return row
}

type Data<T> = { data: T; status?: number }

test('request tools are listed under their scopes', async () => {
  const user = await makeUser()
  const client = await connect('catalog:read requests:write', user)
  try {
    const names = (await client.listTools()).tools.map((t) => t.name)
    for (const name of ['list_requests', 'get_request', 'toggle_upvote', 'toggle_request_claim', 'scaffold_request']) {
      expect(names).toContain(name)
    }
    expect(names).not.toContain('admin_update_request')
  } finally {
    await client.close()
  }

  const admin = await makeAdmin()
  const adminClient = await connect('admin:requests:write', admin)
  try {
    const names = (await adminClient.listTools()).tools.map((t) => t.name)
    expect(names).toContain('admin_update_request')
    expect(names).toContain('admin_delete_request')
  } finally {
    await adminClient.close()
  }
})

test('a user votes and claims through MCP and sees it on get_request', async () => {
  const user = await makeUser({ username: 'builder' })
  const row = await seed(user, { status: 'approved' })
  const client = await connect('catalog:read requests:write', user)
  try {
    const vote = await client.callTool({ name: 'toggle_upvote', arguments: { params: { id: row.id } } })
    expect(vote.isError).toBe(false)
    const claim = await client.callTool({ name: 'toggle_request_claim', arguments: { params: { id: row.id } } })
    expect(claim.isError).toBe(false)
    expect((claim.structuredContent as Data<{ claimed: boolean }>).data.claimed).toBe(true)

    const view = await client.callTool({ name: 'get_request', arguments: { params: { id: 'firebird' } } })
    expect(view.isError).toBe(false)
    expect((view.structuredContent as Data<Record<string, unknown>>).data).toMatchObject({
      status: 'approved',
      upvotes: 1,
      claims: 1,
      votedByMe: true,
      claimedByMe: true,
    })

    // The nested body reaches the route as the user: without the workflow scope
    // it answers with the re-authorization URL instead of creating anything.
    const github = spyOn(global, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify({ login: 'builder' }), {
          status: 200,
          headers: { 'x-oauth-scopes': 'public_repo' },
        })) as unknown as typeof fetch,
    )
    const scaffold = await client.callTool({
      name: 'scaffold_request',
      arguments: { params: { id: row.id }, body: { driver: { dbType: 'file', withUi: true } } },
    })
    github.mockRestore()
    expect(scaffold.isError).toBe(true)
    expect(scaffold.structuredContent).toMatchObject({ status: 403, data: { missingScope: 'workflow' } })
  } finally {
    await client.close()
  }
})

test('an admin reviews pending requests through MCP', async () => {
  const user = await makeUser()
  const admin = await makeAdmin()
  const row = await seed(user)
  const client = await connect('catalog:read admin:requests:write', admin)
  try {
    const pending = await client.callTool({ name: 'list_requests', arguments: { query: { status: 'pending' } } })
    expect((pending.structuredContent as Data<{ total: number }>).data.total).toBe(1)

    const approved = await client.callTool({
      name: 'admin_update_request',
      arguments: {
        params: { id: row.id },
        body: { status: 'approved', bounty: { boardStatus: 'most-wanted', difficulty: 'High' } },
      },
    })
    expect(approved.isError).toBe(false)
    expect((approved.structuredContent as Data<{ status: string; bounty: unknown }>).data).toMatchObject({
      status: 'approved',
      bounty: { boardStatus: 'most-wanted', difficulty: 'High' },
    })
    const audit = await db.query.auditLog.findFirst({ where: { action: 'mcp.admin_update_request' } })
    expect(audit?.actorId).toBe(admin.id)
  } finally {
    await client.close()
  }
})
