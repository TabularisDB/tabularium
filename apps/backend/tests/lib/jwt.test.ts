import { describe, it, expect } from 'bun:test'
import { signJwt, verifyJwt, type JwtPayload } from '../../src/lib/jwt'

const payload: JwtPayload = {
  sub: 'user-123',
  identityId: 'identity-123',
  username: 'testuser',
  providerInstanceId: 'github',
}

describe('jwt', () => {
  it('sign then verify returns original payload', async () => {
    const token = await signJwt(payload)
    const result = await verifyJwt(token)
    expect(result?.sub).toBe(payload.sub)
    expect(result?.username).toBe(payload.username)
    expect(result?.provider).toBe(payload.provider)
  })
  it('verifyJwt returns null for garbage token', async () => {
    expect(await verifyJwt('not.a.token')).toBeNull()
  })
  it('verifyJwt returns null for token signed with wrong secret', async () => {
    const { SignJWT } = await import('jose')
    const wrongSecret = new TextEncoder().encode('wrong-secret')
    const badToken = await new SignJWT({ sub: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(wrongSecret)
    expect(await verifyJwt(badToken)).toBeNull()
  })
})
