import { verifyJwt, type JwtPayload } from './jwt'
import { touchSession } from './sessions'

export type DelegatedAccess = {
  user: JwtPayload
  clientId: string
  grantId: string
  scopes: string[]
}
// Only the in-process MCP dispatcher can attach this context. No HTTP header
// can impersonate it, and the client's MCP token never reaches REST handlers.
const delegated = new WeakMap<Request, DelegatedAccess>()
export function attachDelegatedAccess(request: Request, access: DelegatedAccess) {
  delegated.set(request, access)
}
export function delegatedAccess(request: Request) {
  return delegated.get(request)
}
export async function verifySessionToken(token: string): Promise<JwtPayload | null> {
  const user = await verifyJwt(token)
  if (!user || user.bootstrap || (user.jti && !(await touchSession(user.jti)))) return null
  return user
}
export function adminScope(path: string, method: string): string | null {
  const area = path.split('/')[3]
  // Account recovery, setup and token issuance require the actual interactive
  // user or a legacy full-admin token, never a scoped delegated credential.
  if (!area || ['tokens', 'auth', 'setup'].includes(area)) return null
  const action = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'read' : 'write'
  return `admin:${area}:${action}`
}
export function allowsScope(scopes: string[], required: string): boolean {
  return scopes.includes(required)
}
