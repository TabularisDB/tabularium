import { SignJWT, jwtVerify } from 'jose'

export type JwtPayload = {
  sub: string
  username: string
  provider: string
  providerInstanceUrl: string | null
}

const getSecret = () => new TextEncoder().encode(Bun.env.JWT_SECRET!)

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(getSecret())
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as JwtPayload
  } catch {
    return null
  }
}
