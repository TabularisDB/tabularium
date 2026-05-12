import { Elysia, t } from 'elysia'
import { authMiddleware } from '../../../middleware/auth'
import { db } from '../../../db'
import { plugins, users } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { deriveSlug } from '../../../lib/slug'
import { checkGithubOwnership, checkGiteaOwnership } from '../../../lib/providers'

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('hex')
}

export default new Elysia()
  .use(authMiddleware)
  .post('/api/submit/oauth', async ({ user, body, set }) => {
    const { repoUrl, name, description } = body

    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, user.sub),
    })
    if (!dbUser?.accessToken) {
      set.status = 401
      return { error: 'No stored access token — please re-authenticate' }
    }

    let ownership: Awaited<ReturnType<typeof checkGithubOwnership>>
    if (user.provider === 'github') {
      ownership = await checkGithubOwnership(dbUser.accessToken, repoUrl, user.username)
    } else {
      ownership = await checkGiteaOwnership(
        user.providerInstanceUrl!,
        dbUser.accessToken,
        repoUrl,
        user.username,
      )
    }

    if (!ownership.owned) {
      set.status = 403
      return { error: ownership.reason }
    }

    const repoName = repoUrl.split('/').pop()?.replace(/\.git$/, '') ?? repoUrl
    const slug = deriveSlug(repoName)

    const existing = await db.query.plugins.findFirst({
      where: eq(plugins.id, slug),
    })
    if (existing) {
      set.status = 409
      return { error: `Plugin slug '${slug}' is already taken` }
    }

    const webhookSecret = generateWebhookSecret()
    await db.insert(plugins).values({
      id: slug,
      ownerId: user.sub,
      name,
      description,
      author: `${user.username} <${repoUrl}>`,
      repoUrl,
      homepage: repoUrl,
      webhookSecret,
    })

    return {
      slug,
      webhookSecret,
      webhookUrl: `${Bun.env.BASE_URL}/api/webhooks/release`,
    }
  }, {
    body: t.Object({
      repoUrl: t.String(),
      name: t.String(),
      description: t.String(),
    }),
  })
