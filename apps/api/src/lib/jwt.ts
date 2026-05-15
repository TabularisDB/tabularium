import { SignJWT, jwtVerify } from 'jose'
import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { env } from './env'

const PayloadSchema = Type.Object({
  sub: Type.String({ minLength: 1, maxLength: 128 }),
  identityId: Type.Union([Type.String(), Type.Null()]),
  username: Type.String({ minLength: 1, maxLength: 128 }),
  providerInstanceId: Type.Union([Type.String(), Type.Null()]),
  bootstrap: Type.Optional(Type.Boolean()),
})

export type JwtPayload = Static<typeof PayloadSchema>

const ISSUER = 'tabularium'
const AUDIENCE = 'tabularium-api'

function getSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET)
}

export async function signBootstrapJwt(): Promise<string> {
  return signJwt({
    sub: 'bootstrap',
    identityId: null,
    username: 'admin',
    providerInstanceId: null,
    bootstrap: true,
  })
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    if (!Value.Check(PayloadSchema, payload)) return null
    return payload as unknown as JwtPayload
  } catch {
    return null
  }
}
