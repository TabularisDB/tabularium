import { SignJWT, jwtVerify } from 'jose'
import { env } from './env'

export type JwtPayload = {
  sub: string
  identityId: string | null
  username: string
  providerInstanceId: string | null
  bootstrap?: boolean
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

function getSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET)
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getSecret())
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    return payload as unknown as JwtPayload
  } catch {
    return null
  }
}
