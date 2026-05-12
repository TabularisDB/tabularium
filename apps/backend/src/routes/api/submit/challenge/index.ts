import { Elysia, t } from 'elysia'
import { db } from '../../../../db'
import { challenges } from '../../../../db/schema'
import { generateChallengeToken } from '../../../../lib/challenge'

export default new Elysia()
  .post('/', async ({ body }) => {
    const token = generateChallengeToken()
    await db.insert(challenges).values({
      token,
      repoUrl: body.repoUrl,
      expiresAt: Date.now() + 86400000,
    })

    return {
      token,
      instructions: `Place this token in a file named .tabularis (plain text) or tabularis.json (as {"tabularis_token":"${token}"}) at the root of ${body.repoUrl} on the main or master branch. Then call POST /api/submit/challenge/verify?token=${token}`,
    }
  }, {
    detail: { tags: ['Submit'] },
    body: t.Object({ repoUrl: t.String() }),
  })
