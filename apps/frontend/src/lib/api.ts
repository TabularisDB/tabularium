import { treaty } from '@elysiajs/eden'
import type { App } from '@tabularis/registry-backend/src'

const BASE_URL = import.meta.env.DEV ? 'http://localhost:3000' : ''

export const api = treaty<App>(BASE_URL, {
  fetch: { credentials: 'include' },
})
