import { Elysia, t } from 'elysia'
import { authMiddleware } from '../../../../middleware/auth'
import { db } from '../../../../db'
import { challenges, plugins } from '../../../../db/schema'
import { eq } from 'drizzle-orm'
import { fetchChallengeToken, tokensMatch } from '../../../../lib/challenge'
import { deriveSlug } from '../../../../lib/slug'

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('hex')
}

export default new Elysia()
  .use(authMiddleware)
  .post('/api/submit/challenge/verify', async ({ user, query, body, set }) => {
    const challenge = await db.query.challenges.findFirst({
      where: eq(challenges.token, query.token),
    })

    if (!challenge) {
      set.status = 404
      return { error: 'Challenge not found' }
    }
    if (challenge.verified) {
      set.status = 409
      return { error: 'Challenge already used' }
    }
    if (challenge.expiresAt < Date.now()) {
      set.status = 410
      return { error: 'Challenge expired' }
    }

    const result = await fetchChallengeToken(challenge.repoUrl)
    if (!result.ok) {
      set.status = 422
      return { error: result.error }
    }

    if (!tokensMatch(challenge.token, result.token)) {
      set.status = 422
      return { error: 'Token does not match' }
    }

    await db
      .update(challenges)
      .set({ verified: 1, userId: user.sub })
      .where(eq(challenges.token, query.token))

    const repoName = challenge.repoUrl.split('/').pop()?.replace(/\.git$/, '') ?? challenge.repoUrl
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
      name: body.name,
      description: body.description,
      author: `${user.username} <${challenge.repoUrl}>`,
      repoUrl: challenge.repoUrl,
      homepage: challenge.repoUrl,
      webhookSecret,
    })

    return {
      slug,
      webhookSecret,
      webhookUrl: `${Bun.env.BASE_URL}/api/webhooks/release`,
    }
  }, {
    query: t.Object({ token: t.String() }),
    body: t.Object({
      name: t.String(),
      description: t.String(),
    }),
  })
